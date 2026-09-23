import { createHash } from 'node:crypto';

export const TELEMETRY_PATHS = new Set([
  '/otel/v1/traces',
  '/v1/analytics/batch',
]);

export function isTelemetryRequest(url: string): boolean {
  return TELEMETRY_PATHS.has(url.split('?', 1)[0] ?? url);
}

export function isTrustedProxyAddress(
  address: string,
  cidrs: readonly string[],
): boolean {
  const candidate = ipv4ToNumber(address);
  if (candidate === undefined) {
    return false;
  }
  return cidrs.some((cidr) => {
    const [network, bits] = cidr.split('/');
    const base = ipv4ToNumber(network ?? '');
    const prefix = Number(bits);
    if (
      base === undefined ||
      !Number.isInteger(prefix) ||
      prefix < 0 ||
      prefix > 32
    ) {
      return false;
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (candidate & mask) === (base & mask);
  });
}

export function telemetryRateLimitKey(input: {
  url: string;
  ip: string;
  authorization?: string | string[];
}): string {
  const path = input.url.split('?', 1)[0] ?? input.url;
  if (path === '/v1/analytics/batch') {
    const auth = Array.isArray(input.authorization)
      ? input.authorization[0]
      : input.authorization;
    const tokenHash = createHash('sha256')
      .update(auth ?? '')
      .digest('hex');
    return `analytics:${input.ip}:${tokenHash}`;
  }
  return `otel:${input.ip}`;
}

export class TelemetryRateLimiter {
  readonly #hits = new Map<string, number[]>();

  hit(
    key: string,
    max: number,
    windowMs: number,
    now = Date.now(),
  ): { allowed: boolean; retryAfter: number } {
    const start = now - windowMs;
    const hits = (this.#hits.get(key) ?? []).filter(
      (timestamp) => timestamp > start,
    );
    if (hits.length >= max) {
      this.#hits.set(key, hits);
      const first = hits[0];
      const retryAfter =
        first === undefined
          ? Math.max(1, Math.ceil(windowMs / 1_000))
          : Math.max(1, Math.ceil((first + windowMs - now) / 1_000));
      return {
        allowed: false,
        retryAfter,
      };
    }
    hits.push(now);
    this.#hits.set(key, hits);
    return { allowed: true, retryAfter: 0 };
  }
}

function ipv4ToNumber(value: string): number | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  let output = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined;
    }
    const octet = Number(part);
    if (octet > 255) {
      return undefined;
    }
    output = (output << 8) | octet;
  }
  return output >>> 0;
}
