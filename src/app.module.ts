/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// /Users/gentlebookpro/Projekte/checkpoint/backend/gateway/src/app.module.ts
import { AnalyticsIngestionController } from './analytics/analytics-ingestion.controller.js';
import { BannerService } from './banner.service.js';
import { env } from './config/env.js';
import { RetryingSupergraphManager } from './graphql/retrying-supergraph-manager.js';
import { HandlerModule } from './handlers/handler.module.js';
import { HealthModule } from './health/health.module.js';
import {
  PlatformGatewayService,
  getPlatformGateway,
  setPlatformGateway,
} from './platform-token/platform-gateway.service.js';
import { PlatformTokenVerifier } from './platform-token/platform-token.verifier.js';
import { TenantGrpcService } from './tenant/tenant-grpc.client.js';
import { TenantValidationService } from './tenant/tenant-validation.service.js';
import { IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ValkeyModule } from '@omnixys/cache-ts';
import { ContextAccessor, ContextModule } from '@omnixys/context-ts';
import { createGraphQLFormatError } from '@omnixys/graphql-ts';
import { GrpcClientModule } from '@omnixys/grpc-ts/clients';
import { OmnixysHttpModule } from '@omnixys/http-ts';
import { KafkaModule } from '@omnixys/kafka-ts';
import { getLogger, LoggerModule } from '@omnixys/logger-ts';
import { ObservabilityModule } from '@omnixys/observability-ts';
import { SecurityModule } from '@omnixys/security-ts';
import { isUUID } from 'class-validator';
import { fileURLToPath } from 'node:url';

const {
  SERVICE,
  KAFKA_BROKER,
  TEMPO_URI,
  VALKEY_URL,
  VALKEY_PASSWORD,
  INTERNAL_GATEWAY_TOKEN,

  AUTHENTICATION_URI,
  USER_URI,
  EVENT_URI,
  INVITATION_URI,
  TICKET_URI,
  SEAT_URI,
  NOTIFICATION_URI,
  ADDRESS_URI,
  CHAT_URI,
  ANALYTICS_URI,
  COMMUNICATION_GATEWAY_API_KEY,
  SUPERGRAPH_RETRY_INITIAL_MS,
  SUPERGRAPH_RETRY_MAX_MS,
} = env;

const federationLogger = getLogger('GatewayFederation');

/**
 * GraphQL operations that are intentionally tenantless (public flows).
 * For these, the gateway falls back to `env.DEFAULT_TENANT_ID` when no
 * valid `x-tenant-id` header is present. Authenticated business requests
 * never receive a fallback — the tenant is resolved from the principal JWT
 * downstream, and a missing/invalid header yields 400/401.
 */
const PUBLIC_TENANTLESS_OPERATIONS = new Set([
  'credentialsLogin',
  'refresh',
  'authenticate',
  'loginTotp',
  'verifyWebAuthnAuthentication',
  'verifyMagicLink',
  'verifySignUp',
  'register',
  'forgotPassword',
  'resetPassword',
  'verifyGuest',
]);

const TENANTLESS_OPERATION_RE = new RegExp(
  `\\b(?:${[...PUBLIC_TENANTLESS_OPERATIONS].join('|')})\\b`,
);

export interface AuthToken {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  idToken: string;
  scope: string;
}

export type SameSite = 'lax' | 'strict' | 'none';

// Basis für alle Cookies
const isProd = process.env.NODE_ENV === 'production';

export const timerCookieBase = isProd
  ? `Path=/; SameSite=none; Secure; Domain=.omnixys.com`
  : `Path=/; SameSite=lax`;

export const cookieBase = isProd
  ? `Path=/; HttpOnly; SameSite=none; Secure; Domain=.omnixys.com`
  : `Path=/; HttpOnly; SameSite=lax`;

function getCookieValue(name: string, cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Extrahiert Auth + Cookies aus dem eingehenden Gateway-Request.
 * - token: der komplette Authorization-Header (wenn vorhanden)
 * - cookieHeader: der rohe Cookie-Header (wenn vorhanden), damit Subgraphs Cookie-basierte Auth nutzen können
 * - isIntrospection: Flag für __schema/__type
 * - meta: optionale Forward-Infos (IP, UA), falls Subgraphs logs/ratelimiting brauchen
 */
export interface GatewayRequestContext {
  token: string | null;
  cookieHeader: string | null;
  isIntrospection: boolean;
  requestId?: string;
  correlationId?: string;
  traceparent?: string;
  tenantId?: string;
  meta: { ip?: string; ua?: string; host?: string; origin?: string };
}

export const handleAuth = async (input: any): Promise<GatewayRequestContext> => {
  const req = input?.request ?? input?.req ?? (input?.headers ? input : null);

  // Federation / Internal Apollo queries have no request object
  if (!req) {
    return {
      token: null,
      cookieHeader: null,
      isIntrospection: true,
      meta: {},
    };
  }

  // FASTIFY: headers on req
  const headers = req.headers ?? {};

  // FASTIFY: body on req.body
  const body = req.body ?? {};

  const token = headers['authorization'] ?? null;
  const cookieHeader = headers['cookie'] ?? null;

  const activeEvent = getCookieValue('activeEvent', cookieHeader);

  federationLogger.info(
    {
      hasCookieHeader: Boolean(cookieHeader),
      hasAccessToken: Boolean(getCookieValue('access_token', cookieHeader)),
      activeEvent,
    },
    'Incoming cookies',
  );

  // Extract JWT from cookie if no Authorization header present
  const cookieToken = getCookieValue('access_token', cookieHeader);
  const bearerToken = token ?? (cookieToken ? `Bearer ${cookieToken}` : null);

  const query = body?.query ?? '';
  const isIntrospection =
    typeof query === 'string' &&
    (query.includes('__schema') ||
      query.includes('__type') ||
      query.includes('_service') ||
      query.includes('__Apollo'));

  const current = ContextAccessor.get();
  const meta = {
    ip: current?.client?.ip ?? req?.ip ?? req?.socket?.remoteAddress,
    ua: headers['user-agent'] ?? '',
    host: headers['host'] ?? '',
    origin: headers['origin'] ?? '',
  };
  const isTenantless = isPublicTenantlessOperation(body?.operationName, query);

  let tenantId = isTenantless
    ? env.DEFAULT_TENANT_ID
    : typeof headers['x-tenant-id'] === 'string' && isUUID(headers['x-tenant-id'], '4')
      ? headers['x-tenant-id']
      : undefined;

  // Edge-Trust-Boundary: Für authentifizierte (nicht-tenantless) Operationen
  // wird das Plattform-Token verifiziert und der Tenant aus dem `tenant_id`-
  // Claim abgeleitet (client-Header wird ignoriert), inkl. Membership-Check
  // gegen den tenant-service (fail-closed, Valkey-Cache).
  if (!isIntrospection && !isTenantless && bearerToken) {
    const platform = getPlatformGateway();
    if (platform) {
      tenantId =
        (await platform.resolveTenant(bearerToken.replace(/^Bearer\s+/i, ''))) ?? undefined;
    }
  }

  const requestId = current?.requestId ?? headerValue(headers['x-request-id']) ?? undefined;
  const correlationId =
    current?.correlationId ?? headerValue(headers['x-correlation-id']) ?? requestId;
  const traceparent =
    createTraceparent(current?.trace?.traceId, current?.trace?.spanId) ??
    headerValue(headers.traceparent) ??
    undefined;

  return {
    token: bearerToken,
    cookieHeader,
    isIntrospection,
    requestId,
    correlationId,
    traceparent,
    tenantId,
    meta,
  };
};

/**
 * Resolve the outgoing tenant identifier.
 *
 * - A valid `x-tenant-id` UUID is forwarded as-is.
 * - Without a valid header, only public tenantless operations get the
 *   configured default tenant; everything else stays `undefined` so the
 *   subgraph resolves the tenant from the principal or rejects the request.
 */
function isPublicTenantlessOperation(operationName: unknown, query: string): boolean {
  const named =
    typeof operationName === 'string' && operationName.length > 0
      ? operationName
      : extractOperationName(query);
  return named ? PUBLIC_TENANTLESS_OPERATIONS.has(named) : TENANTLESS_OPERATION_RE.test(query);
}

function extractOperationName(query: string): string | undefined {
  const match = query.match(/(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1];
}

function headerValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function createTraceparent(traceId?: string, spanId?: string): string | null {
  return /^[a-f0-9]{32}$/i.test(traceId ?? '') && /^[a-f0-9]{16}$/i.test(spanId ?? '')
    ? `00-${traceId}-${spanId}-01`
    : null;
}

interface HeaderSink {
  set(name: string, value: string): unknown;
  delete(name: string): unknown;
}

export function applyGatewayHeaders(
  headers: HeaderSink | undefined,
  context: GatewayRequestContext | undefined,
): void {
  if (!headers || !context) {
    return;
  }
  headers.set('x-internal-token', INTERNAL_GATEWAY_TOKEN);
  if (context.isIntrospection) {
    headers.set('x-introspection', 'true');
  }
  if (context.tenantId) {
    headers.set('x-tenant-id', context.tenantId);
  } else {
    headers.delete('x-tenant-id');
  }
  if (context.token) {
    headers.set('authorization', context.token);
  }
  if (context.cookieHeader) {
    headers.set('cookie', context.cookieHeader);
  }
  if (context.requestId) {
    headers.set('x-request-id', context.requestId);
  }
  if (context.correlationId) {
    headers.set('x-correlation-id', context.correlationId);
  }
  if (context.traceparent) {
    headers.set('traceparent', context.traceparent);
  }
  if (context.meta?.ip) {
    headers.set('x-forwarded-for', context.meta.ip);
  }
  if (context.meta?.ua) {
    headers.set('x-forwarded-user-agent', context.meta.ua);
  }
  if (context.meta?.host) {
    headers.set('x-forwarded-host', context.meta.host);
  }
  if (context.meta?.origin) {
    headers.set('origin', context.meta.origin);
  }
}

// Hilfsfunktion: Cookies setzen (auf Gateway-Origin)
export function appendCookieHeaders(ctx: any) {
  const res = ctx?.response;
  const http = res?.http;

  // Wenn kein HTTP-Response (z. B. WS, Fehler), abbrechen
  if (!http) {
    return;
  }

  const body = res?.body;
  const single = body?.singleResult;

  // Falls nicht existiert -> keine Cookie-Analyse möglich
  if (!single || typeof single !== 'object') {
    return;
  }

  const data = single.data ?? {};
  const errors = single.errors;

  // Debug-Log bei Fehlern
  if (errors && errors.length > 0) {
    federationLogger.warn(
      { errorCount: errors.length },
      'Federated GraphQL response contains errors',
    );
  }

  // --- Logout ---
  const didLogout = data?.logout?.ok ?? false;
  if (didLogout) {
    const sameSite: SameSite = isProd ? 'none' : 'lax';
    const secure = isProd;

    http.headers.set('set-cookie', [
      clearCookie('access_token', { sameSite, secure }),
      clearCookie('refresh_token', { sameSite, secure }),
      clearCookie('access_expires_at', { sameSite, secure }),
    ]);
    return;
  }

  // --- Login / Refresh ---
  const authPayload: AuthToken =
    data?.credentialsLogin ??
    data?.refresh ??
    data?.authenticate ??
    data?.loginTotp ??
    data?.verifyWebAuthnAuthentication ??
    data?.verifyMagicLink ??
    data?.verifySignUp?.token;
  if (!authPayload) {
    return;
  }

  const accessToken = authPayload?.accessToken;
  const refreshToken = authPayload?.refreshToken;
  const expiresAt = Date.now() + (authPayload?.expiresIn ?? 300) * 1000;

  if (!accessToken || !refreshToken) {
    return;
  }

  http.headers.set('set-cookie', [
    `access_token=${accessToken}; Max-Age=${authPayload?.expiresIn ?? 300}; ${cookieBase}`,
    `refresh_token=${refreshToken}; Max-Age=${authPayload?.refreshExpiresIn ?? 1800}; ${cookieBase}`,
    `access_expires_at=${expiresAt}; Max-Age=${authPayload?.expiresIn ?? 300}; ${timerCookieBase}`,
  ]);
}

function clearCookie(name: string, opts?: { secure?: boolean; sameSite?: SameSite }) {
  const parts: string[] = [
    `${name}=`,
    `Path=/`,
    `HttpOnly`,
    `Max-Age=0`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `SameSite=${opts?.sameSite ?? 'lax'}`,
  ];
  // Secure MUSS identisch sein
  if (opts?.secure) {
    parts.push(`Secure`);
  }

  // Domain MUSS identisch sein (PROD!)
  if (isProd) {
    parts.push(`Domain=.omnixys.com`);
  }

  return parts.join('; ');
}

@Module({
  imports: [
    ContextModule.forRoot(),
    OmnixysHttpModule.forRoot({ serviceName: SERVICE }),
    ConfigModule.forRoot({ isGlobal: true }),
    SecurityModule.forRoot({
      jwt: {
        issuer: env.PLATFORM_ISSUER,
        jwksUri: env.PLATFORM_JWKS_URI,
      },
      globalGuards: false,
      rateLimit: { enabled: false },
    }),
    GrpcClientModule.register({
      package: 'omnixys.tenant',
      protoPath: fileURLToPath(import.meta.resolve('@omnixys/grpc-ts/proto/tenant.proto')),
      url: env.TENANT_GRPC_URL,
    }),
    GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,

      server: {
        formatError: createGraphQLFormatError({
          serviceName: SERVICE,
          preserveSafeSubgraphExtensions: true,
        }),
        // Wichtig: Context baut die Infos, die in willSendRequest unten landen
        context: (request: any) => handleAuth(request),
        // Plugin: fange Auth-Antworten ab und setze Cookies auf Gateway-Origin
        plugins: [
          {
            async requestDidStart() {
              return {
                async willSendResponse(ctx) {
                  try {
                    appendCookieHeaders(ctx as any);
                  } catch (e) {
                    // Optional: Logging, aber aufpassen, dass das Response nicht bricht
                    federationLogger.error({ error: e }, 'Gateway cookie compatibility failed');
                  }
                },
              };
            },
          },
        ],
      },
      gateway: {
        // Federation v2 via Introspect & Compose
        supergraphSdl: new RetryingSupergraphManager(
          new IntrospectAndCompose({
            pollIntervalInMs: isProd ? 60_000 : 10_000,
            subgraphs: [
              { name: 'authentication', url: AUTHENTICATION_URI },
              { name: 'user', url: USER_URI },
              { name: 'event', url: EVENT_URI },
              { name: 'invitation', url: INVITATION_URI },
              { name: 'ticket', url: TICKET_URI },
              { name: 'notification', url: NOTIFICATION_URI },
              { name: 'seat', url: SEAT_URI },
              { name: 'address', url: ADDRESS_URI },
              { name: 'chat', url: CHAT_URI },
              { name: 'analytics', url: ANALYTICS_URI },
            ],
          }),
          {
            initialDelayMs: SUPERGRAPH_RETRY_INITIAL_MS,
            maxDelayMs: SUPERGRAPH_RETRY_MAX_MS,
            onRetry: ({ attempt, delayMs, error }) =>
              federationLogger.warn(
                { attempt, delayMs, error },
                'Subgraph introspection failed during startup; retrying',
              ),
          },
        ),

        // RemoteGraphQLDataSource: hier leiten wir Headers an die Subgraphs weiter
        buildService: ({ name, url }) =>
          new (class extends RemoteGraphQLDataSource {
            override async willSendRequest({ request, context }: any) {
              applyGatewayHeaders(request.http?.headers, context as GatewayRequestContext);
              if (name === 'communication-gateway') {
                request.http?.headers.set('x-internal-api-key', COMMUNICATION_GATEWAY_API_KEY);
              }
            }
          })({ url }),
      },
    }),
    HandlerModule,
    HealthModule,

    ValkeyModule.forRoot({
      serviceName: `${SERVICE}-service`,
      url: VALKEY_URL,
      password: VALKEY_PASSWORD,

      pubSub: { enabled: true },
      streams: { enabled: true },
    }),

    KafkaModule.forRoot({
      clientId: SERVICE,
      brokers: [KAFKA_BROKER],
      groupId: `${SERVICE}-consumer`,
      serviceName: SERVICE,
    }),

    ObservabilityModule.forRoot({
      serviceName: SERVICE,

      otel: {
        endpoint: TEMPO_URI,
        transport: 'http',
        samplingRatio: 1,
      },

      metrics: {
        port: 9464,
        enabled: true,
      },
    }),

    LoggerModule.forRoot({
      serviceName: SERVICE,
      registerGlobalInterceptor: true,

      batch: {
        enabled: true,
        maxSize: 50,
        flushInterval: 2000,
      },
    }),
  ],
  controllers: [AnalyticsIngestionController],
  providers: [
    BannerService,
    PlatformGatewayService,
    PlatformTokenVerifier,
    TenantValidationService,
    TenantGrpcService,
  ],
})
export class AppModule {
  constructor(platformGateway: PlatformGatewayService) {
    setPlatformGateway(platformGateway);
  }
}
