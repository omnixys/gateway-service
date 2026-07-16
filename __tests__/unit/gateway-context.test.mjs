import {
  applyGatewayHeaders,
  handleAuth,
} from '../../dist/app.module.js';
import { ContextAccessor } from '@omnixys/context';
import {
  NotificationHandler,
  normalizeKafkaDate,
} from '../../dist/handlers/notification.handler.js';
import assert from 'node:assert/strict';
import test from 'node:test';

test('gateway derives auth and canonical propagation metadata', () => {
  ContextAccessor.run(
    {
      requestId: 'request-gateway',
      correlationId: 'correlation-gateway',
      trace: {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
      },
      client: { ip: '192.0.2.10' },
    },
    () => {
      const context = handleAuth({
        headers: {
          cookie: 'access_token=cookie-token; locale=de-DE',
          'user-agent': 'gateway-test',
          'x-forwarded-for': '203.0.113.99',
        },
        body: { query: 'query { me { id } }' },
        ip: '127.0.0.1',
      });

      assert.equal(context.token, 'Bearer cookie-token');
      assert.equal(context.requestId, 'request-gateway');
      assert.equal(context.correlationId, 'correlation-gateway');
      assert.equal(context.meta.ip, '192.0.2.10');
      assert.equal(
        context.traceparent,
        '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      );
    },
  );
});

test('applyGatewayHeaders does not crash when context is undefined', () => {
  const values = new Map();
  applyGatewayHeaders(
    { set: (name, value) => values.set(name, value) },
    undefined,
  );

  assert.equal(values.size, 0);
});

test('applyGatewayHeaders does not crash when context is empty (no meta)', () => {
  const values = new Map();
  applyGatewayHeaders(
    { set: (name, value) => values.set(name, value) },
    {},
  );

  assert.equal(values.size, 1);
  assert.equal(values.has('x-internal-token'), true);
});

test('applyGatewayHeaders does not crash when context.meta is missing', () => {
  const values = new Map();
  applyGatewayHeaders(
    { set: (name, value) => values.set(name, value) },
    { isIntrospection: true },
  );

  assert.equal(values.get('x-introspection'), 'true');
});

test('applyGatewayHeaders handles partial meta gracefully', () => {
  const values = new Map();
  applyGatewayHeaders(
    { set: (name, value) => values.set(name, value) },
    { meta: { ua: 'test-agent' } },
  );

  assert.equal(values.get('x-forwarded-user-agent'), 'test-agent');
  assert.equal(values.has('x-forwarded-for'), false);
});

test('gateway forwards canonical headers to every subgraph request', () => {
  const values = new Map();
  applyGatewayHeaders(
    { set: (name, value) => values.set(name, value) },
    {
      token: 'Bearer access',
      cookieHeader: 'access_token=access',
      isIntrospection: false,
      requestId: 'request-1',
      correlationId: 'correlation-1',
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      meta: { ip: '192.0.2.1', ua: 'test' },
    },
  );

  assert.equal(values.get('x-request-id'), 'request-1');
  assert.equal(values.get('x-correlation-id'), 'correlation-1');
  assert.equal(values.get('authorization'), 'Bearer access');
  assert.equal(values.get('x-forwarded-for'), '192.0.2.1');
  assert.ok(values.has('traceparent'));
});

test('signup subscriptions never expose credentials', async () => {
  let published;
  const handler = new NotificationHandler(
    {
      async publish(topic, payload) {
        published = { topic, payload };
      },
    },
    {
      log() {
        return { debug() {}, info() {}, warn() {}, error() {} };
      },
    },
  );

  await handler.handleSendCredentials(
    {
      userId: 'user-1',
      username: 'user',
      password: 'must-not-leak',
      invitationId: 'invitation-1',
      firstName: 'Test',
      lastName: 'User',
    },
    {},
  );

  assert.equal(published.topic, 'USER_SIGNED_UP');
  assert.equal('password' in published.payload, false);
});

test('normalizeKafkaDate accepts Date and serialized Kafka timestamps', () => {
  const iso = '2026-07-04T19:46:53.975Z';

  assert.equal(normalizeKafkaDate(new Date(iso)), iso);
  assert.equal(normalizeKafkaDate(iso), iso);
  assert.equal(normalizeKafkaDate('not-a-date'), undefined);
  assert.equal(normalizeKafkaDate(undefined), undefined);
});

test('whatsapp message subscriptions accept Kafka string timestamps', async () => {
  let published;
  const handler = new NotificationHandler(
    {
      async publish(topic, payload) {
        published = { topic, payload };
      },
    },
    {
      log() {
        return { debug() {}, info() {}, warn() {}, error() {} };
      },
    },
  );

  await handler.handleMessageCreated(
    {
      key: 'chat-1',
      value: {
        id: 'message-1',
        chatId: 'chat-1',
        direction: 'INBOUND',
        from: 'sender',
        to: 'recipient',
        body: 'hello',
        createdAt: '2026-07-04T19:46:53.975Z',
      },
    },
    {},
  );

  assert.equal(published.topic, 'whatsapp.message.chat-1');
  assert.equal(
    published.payload.whatsappMessage.createdAt,
    '2026-07-04T19:46:53.975Z',
  );
});
