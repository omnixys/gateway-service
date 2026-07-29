import assert from 'node:assert/strict';
import test from 'node:test';
import { BadGatewayException } from '@nestjs/common';
import { AnalyticsIngestionController } from '../../dist/analytics/analytics-ingestion.controller.js';

test('analytics batch proxy preserves API-key and correlation headers', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let responseStatus;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url).endsWith('/v1/analytics/batch'), true);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.get('authorization'), 'Bearer omx_live.secret');
    assert.equal(init.headers.get('x-correlation-id'), 'correlation-1');
    assert.equal(init.headers.get('x-tenant-id'), null);
    return new Response(
      JSON.stringify({
        batchId: 'batch-1',
        accepted: 1,
        rejected: 0,
        quarantined: 0,
        issues: [],
      }),
      { status: 202, headers: { 'content-type': 'application/json' } },
    );
  };
  const reply = {
    header: () => reply,
    status: (status) => {
      responseStatus = status;
      return reply;
    },
  };

  const payload = await new AnalyticsIngestionController().ingestBatch(
    {
      authorization: 'Bearer omx_live.secret',
      'x-correlation-id': 'correlation-1',
      'x-tenant-id': 'spoofed-tenant',
    },
    { batchId: 'batch-1', events: [{}] },
    reply,
  );

  assert.equal(responseStatus, 202);
  assert.equal(payload.accepted, 1);
});

test('analytics batch proxy maps transport failures to a typed 502', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    throw new Error('connection refused');
  };

  await assert.rejects(
    new AnalyticsIngestionController().ingestBatch(
      {},
      {},
      { header: () => undefined, status: () => undefined },
    ),
    (error) =>
      error instanceof BadGatewayException &&
      error.getResponse().code === 'ANALYTICS_UNAVAILABLE',
  );
});
