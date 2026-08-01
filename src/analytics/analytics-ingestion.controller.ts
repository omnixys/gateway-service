import { corsOptions } from '../config/cors.js';
import { env } from '../config/env.js';
import {
  BadGatewayException,
  Body,
  Controller,
  Headers as RequestHeaders,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import { ContextAccessor } from '@omnixys/context-ts';
import { isUUID } from 'class-validator';
import type { FastifyReply } from 'fastify';

const FORWARDED_HEADERS = [
  'authorization',
  'x-request-id',
  'x-correlation-id',
  'traceparent',
  'origin',
] as const;

export const CHECKPOINT_ANALYTICS_EVENTS = [
  '$alias',
  '$group',
  '$identify',
  '$pageview',
  'ConversationOpened',
  'InvitationOpened',
  'LoginStarted',
  'MessageSendStarted',
  'QrScanStarted',
  'RsvpStarted',
  'SeatChangeStarted',
  'TicketDownloadStarted',
  'TicketDownloaded',
] as const;

interface AnalyticsTokenRequest {
  publicReference?: {
    type?: 'event' | 'invitation';
    id?: string;
  };
}

@Controller('v1/analytics')
export class AnalyticsIngestionController {
  @Post('token')
  async issueToken(
    @RequestHeaders()
    incomingHeaders: Record<string, string | string[] | undefined>,
    @Body() body?: AnalyticsTokenRequest,
  ): Promise<unknown> {
    const context = ContextAccessor.get();
    let tenantId = context?.tenant?.verified ? context.tenant.tenantId : undefined;
    if (!tenantId) {
      tenantId = await resolvePublicTenant(body?.publicReference);
    }
    const origin = firstHeader(incomingHeaders.origin);
    if (!origin || !allowedOrigins().has(origin)) {
      throw new ForbiddenException({
        code: 'ANALYTICS_ORIGIN_FORBIDDEN',
        message: 'Origin is not allowed for analytics',
      });
    }
    return proxyJson(env.ANALYTICS_TOKEN_URI, {
      headers: {
        'content-type': 'application/json',
        'x-internal-token': env.INTERNAL_GATEWAY_TOKEN,
        'x-tenant-id': tenantId,
      },
      body: {
        origin,
        environment: gatewayEnvironment(),
        events: CHECKPOINT_ANALYTICS_EVENTS,
      },
    });
  }

  @Post('flags/evaluate')
  evaluateFlags(
    @RequestHeaders()
    incomingHeaders: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<unknown> {
    const origin = firstHeader(incomingHeaders.origin);
    if (!origin || !allowedOrigins().has(origin)) {
      throw new ForbiddenException({
        code: 'ANALYTICS_ORIGIN_FORBIDDEN',
        message: 'Origin is not allowed for analytics',
      });
    }
    return proxyJson(env.ANALYTICS_FLAGS_URI, {
      headers: {
        authorization: firstHeader(incomingHeaders.authorization) ?? '',
        'content-type': 'application/json',
        origin,
      },
      body,
    });
  }

  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestBatch(
    @RequestHeaders()
    incomingHeaders: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const headers = new Headers({ 'content-type': 'application/json' });
    for (const name of FORWARDED_HEADERS) {
      const value = firstHeader(incomingHeaders[name]);
      if (value) {
        headers.set(name, value);
      }
    }

    let response: Response;
    try {
      response = await fetch(env.ANALYTICS_INGESTION_URI, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      throw new BadGatewayException({
        code: 'ANALYTICS_UNAVAILABLE',
        message: 'Analytics ingestion is unavailable',
        cause: cause instanceof Error ? cause.message : 'Unknown upstream error',
      });
    }

    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      reply.header('retry-after', retryAfter);
    }
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new HttpException(exceptionPayload(payload), response.status);
    }
    reply.status(response.status);
    return payload;
  }
}

async function resolvePublicTenant(
  reference: AnalyticsTokenRequest['publicReference'],
): Promise<string> {
  if (
    !reference ||
    (reference.type !== 'event' && reference.type !== 'invitation') ||
    !reference.id ||
    !isUUID(reference.id)
  ) {
    throw new ForbiddenException({
      code: 'VERIFIED_TENANT_REQUIRED',
      message: 'A verified tenant context or public RSVP reference is required',
    });
  }
  const result = await proxyJson(env.INVITATION_ANALYTICS_TENANT_URI, {
    headers: {
      'content-type': 'application/json',
      'x-internal-token': env.INTERNAL_GATEWAY_TOKEN,
    },
    body: reference,
  });
  const tenantId =
    result && typeof result === 'object' ? (result as Record<string, unknown>).tenantId : undefined;
  if (typeof tenantId !== 'string' || !isUUID(tenantId)) {
    throw new BadGatewayException({
      code: 'INVITATION_TENANT_INVALID',
      message: 'Invitation returned an invalid tenant resolution',
    });
  }
  return tenantId;
}

async function proxyJson(
  url: string,
  input: {
    headers: Record<string, string>;
    body: unknown;
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: input.headers,
      body: JSON.stringify(input.body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    throw new BadGatewayException({
      code: 'ANALYTICS_UNAVAILABLE',
      message: 'Analytics is unavailable',
      cause: cause instanceof Error ? cause.message : 'Unknown upstream error',
    });
  }
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new HttpException(exceptionPayload(payload), response.status);
  }
  return payload;
}

function allowedOrigins(): Set<string> {
  return new Set(
    Array.isArray(corsOptions.origin)
      ? corsOptions.origin.filter((origin): origin is string => typeof origin === 'string')
      : [],
  );
}

function gatewayEnvironment(): 'development' | 'staging' | 'production' {
  if (env.NODE_ENV === 'production') {
    return 'production';
  }
  if (env.NODE_ENV === 'staging') {
    return 'staging';
  }
  return 'development';
}

function exceptionPayload(payload: unknown): string | Record<string, unknown> {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : String(payload);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      code: 'INVALID_ANALYTICS_RESPONSE',
      message: text,
    };
  }
}
