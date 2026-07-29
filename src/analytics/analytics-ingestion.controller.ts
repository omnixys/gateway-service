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
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

const FORWARDED_HEADERS = [
  'authorization',
  'x-request-id',
  'x-correlation-id',
  'traceparent',
] as const;

@Controller('v1/analytics')
export class AnalyticsIngestionController {
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
