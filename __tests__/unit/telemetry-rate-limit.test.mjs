import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTelemetryRequest,
  isTrustedProxyAddress,
  TelemetryRateLimiter,
  telemetryRateLimitKey,
} from '../../dist/observability/telemetry-rate-limit.js';

test('only telemetry paths bypass the global rate-limit bucket', () => {
  assert.equal(isTelemetryRequest('/otel/v1/traces'), true);
  assert.equal(isTelemetryRequest('/v1/analytics/batch?flush=1'), true);
  assert.equal(isTelemetryRequest('/graphql'), false);
});

test('trusts only configured proxy CIDRs', () => {
  assert.equal(isTrustedProxyAddress('172.18.0.11', ['172.18.0.0/16']), true);
  assert.equal(isTrustedProxyAddress('198.51.100.4', ['172.18.0.0/16']), false);
  assert.equal(isTrustedProxyAddress('172.18.0.11', ['invalid']), false);
});

test('telemetry limiter keeps OTEL and analytics quotas independent', () => {
  const limiter = new TelemetryRateLimiter();
  const now = 1_000;
  const otel = telemetryRateLimitKey({ url: '/otel/v1/traces', ip: '198.51.100.10' });
  const analytics = telemetryRateLimitKey({
    url: '/v1/analytics/batch',
    ip: '198.51.100.10',
    authorization: 'Bearer token-a',
  });

  assert.equal(limiter.hit(otel, 2, 60_000, now).allowed, true);
  assert.equal(limiter.hit(otel, 2, 60_000, now).allowed, true);
  const limited = limiter.hit(otel, 2, 60_000, now);
  assert.deepEqual(limited, { allowed: false, retryAfter: 60 });
  assert.equal(limiter.hit(analytics, 2, 60_000, now).allowed, true);
});

test('analytics uses token and client IP instead of a shared proxy bucket', () => {
  const first = telemetryRateLimitKey({
    url: '/v1/analytics/batch', ip: '198.51.100.10', authorization: 'Bearer one',
  });
  const second = telemetryRateLimitKey({
    url: '/v1/analytics/batch', ip: '198.51.100.11', authorization: 'Bearer one',
  });
  const third = telemetryRateLimitKey({
    url: '/v1/analytics/batch', ip: '198.51.100.10', authorization: 'Bearer two',
  });
  assert.notEqual(first, second);
  assert.notEqual(first, third);
  assert.equal(first.includes('Bearer one'), false);
});
