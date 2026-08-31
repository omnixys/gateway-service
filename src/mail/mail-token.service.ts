import { env } from '../config/env.js';
import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ValkeyRateLimitService } from '@omnixys/cache-ts';
import { ContextAccessor } from '@omnixys/context-ts';
import { createHash, timingSafeEqual } from 'node:crypto';

export interface MailTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class MailTokenService {
  constructor(private readonly rateLimit: ValkeyRateLimitService) {}

  async issue(input: {
    authorization: string;
    serviceToken?: string;
    subject: string;
    ip: string;
  }): Promise<MailTokenResponse> {
    if (!this.validServiceToken(input.serviceToken)) {
      throw new ForbiddenException({
        code: 'OMNIMAIL_SERVICE_AUTHENTICATION_FAILED',
        message: 'Omnimail service authentication failed',
      });
    }
    const rateKey = createHash('sha256')
      .update(`${input.subject}:${input.ip}`, 'utf8')
      .digest('hex');
    const allowed = await this.rateLimit.hit(
      `mail-token:${rateKey}`,
      env.MAIL_TOKEN_RATE_LIMIT_REQUESTS,
      env.MAIL_TOKEN_RATE_LIMIT_WINDOW,
    );
    if (!allowed) {
      throw new HttpException(
        {
          code: 'MAIL_TOKEN_RATE_LIMIT_EXCEEDED',
          message: 'Too many mail authentication requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

  
    const context = ContextAccessor.get();
    const tenantId = context?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException({
        code: "UNAUTHORIZED_TENANT",
        message: "Verified tenant context is required",
      });
    }
    const headers: Record<string, string> = {
      authorization: input.authorization,
      'x-internal-token': env.INTERNAL_GATEWAY_TOKEN,
    };
    
    headers["x-tenant-id"] = tenantId;

    if (context?.requestId) {
      headers['x-request-id'] = context.requestId;
    }
    if (context?.correlationId) {
      headers['x-correlation-id'] = context.correlationId;
    }
    if (context?.trace?.traceId && context.trace.spanId) {
      headers.traceparent = `00-${context.trace.traceId}-${context.trace.spanId}-01`;
    }

    let response: Response;
    try {
      response = await fetch(env.AUTHENTICATION_MAIL_TOKEN_URI, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      throw new BadGatewayException({
        code: 'MAIL_AUTHENTICATION_UNAVAILABLE',
        message: 'Mail authentication is unavailable',
        cause: cause instanceof Error ? cause.message : 'Unknown upstream error',
      });
    }
    if (!response.ok) {
      throw new BadGatewayException({
        code: 'MAIL_AUTHENTICATION_UNAVAILABLE',
        message: 'Mail authentication is unavailable',
      });
    }
    const payload = (await response.json()) as Partial<MailTokenResponse>;
    if (
      typeof payload.accessToken !== 'string' ||
      payload.tokenType !== 'Bearer' ||
      typeof payload.expiresIn !== 'number' ||
      payload.expiresIn <= 0
    ) {
      throw new BadGatewayException({
        code: 'MAIL_AUTHENTICATION_RESPONSE_INVALID',
        message: 'Mail authentication returned an invalid response',
      });
    }
    return payload as MailTokenResponse;
  }

  private validServiceToken(value: string | undefined): boolean {
    return [env.OMNIMAIL_SERVICE_TOKEN_CURRENT, env.OMNIMAIL_SERVICE_TOKEN_PREVIOUS].some(
      (candidate) => secureEqual(value, candidate),
    );
  }
}

function secureEqual(value: string | undefined, expected: string): boolean {
  if (!value || !expected) {
    return false;
  }
  const actual = Buffer.from(value);
  const candidate = Buffer.from(expected);
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}
