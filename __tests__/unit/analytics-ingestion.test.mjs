import assert from 'node:assert/strict';
import test from 'node:test';
import { BadGatewayException } from '@nestjs/common';
import { AnalyticsIngestionController } from '../../dist/analytics/analytics-ingestion.controller.js';
import { ContextAccessor } from '@omnixys/context';

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
    assert.equal(init.headers.get('origin'), 'https://checkpoint.omnixys.com');
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
      origin: 'https://checkpoint.omnixys.com',
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

test('analytics token broker uses only the verified tenant and fixed allowlist', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const tenantId = '00000000-0000-4000-8000-000000000001';
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers['x-tenant-id'], tenantId);
    assert.equal(init.headers['x-internal-token'].length > 0, true);
    const body = JSON.parse(init.body);
    assert.equal(body.origin, 'https://checkpoint.omnixys.com');
    assert.equal(body.events.includes('LoginStarted'), true);
    assert.equal(body.events.includes('arbitrary-client-event'), false);
    return new Response(JSON.stringify({ token: 'browser-token', expiresIn: 900 }), {
      status: 200,
    });
  };

  const result = await ContextAccessor.run(
    {
      requestId: 'request-token',
      correlationId: 'request-token',
      startedAtEpochMs: Date.now(),
      tenant: { tenantId, source: 'jwt-claim', verified: true },
      client: {},
      transport: {},
      trace: {},
    },
    () =>
      new AnalyticsIngestionController().issueToken({
        origin: 'https://checkpoint.omnixys.com',
      }),
  );
  assert.equal(result.token, 'browser-token');
});

test('public RSVP token broker resolves the tenant through invitation', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const eventId = '00000000-0000-4000-8000-000000000002';
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    if (String(url).endsWith('/internal/analytics/tenant')) {
      assert.deepEqual(JSON.parse(init.body), { type: 'event', id: eventId });
      assert.equal(init.headers['x-internal-token'].length > 0, true);
      return new Response(JSON.stringify({ tenantId }), { status: 200 });
    }
    assert.equal(init.headers['x-tenant-id'], tenantId);
    return new Response(JSON.stringify({ token: 'public-browser-token' }), {
      status: 200,
    });
  };

  const result = await new AnalyticsIngestionController().issueToken(
    { origin: 'https://checkpoint.omnixys.com' },
    { publicReference: { type: 'event', id: eventId } },
  );
  assert.equal(calls, 2);
  assert.equal(result.token, 'public-browser-token');
});

test('public RSVP token broker rejects browser tenant IDs without a reference', async () => {
  await assert.rejects(
    new AnalyticsIngestionController().issueToken(
      {
        origin: 'https://checkpoint.omnixys.com',
        'x-tenant-id': '00000000-0000-4000-8000-000000000009',
      },
      {},
    ),
    (error) => error?.getResponse?.().code === 'VERIFIED_TENANT_REQUIRED',
  );
});
