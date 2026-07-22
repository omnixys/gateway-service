import {
  applyGatewayHeaders,
  handleAuth,
} from '../../dist/app.module.js';
import { ContextAccessor } from '@omnixys/context';
import {
  NotificationHandler,
  normalizeKafkaDate,
} from '../../dist/handlers/notification.handler.js';
import { createSubscriptionContext } from '../../dist/subscriptions/subscription.module.js';
import { GraphQLValkeyPubSubAdapter } from '../../dist/subscriptions/adapter/graphql-valkey-pubsub.adapter.js';
import {
  toChatConversation,
  toChatMessage,
  UserSignupSubscriptionResolver,
} from '../../dist/subscriptions/subscription.resolver.js';
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

test('subscription context exposes the HttpOnly access token from the upgrade cookie', () => {
  const request = {
    headers: {
      cookie: 'locale=de-DE; access_token=encoded%20token',
    },
  };

  const context = createSubscriptionContext({ extra: { request } });

  assert.equal(context.req, request);
  assert.equal(context.req.cookies.access_token, 'encoded token');
  assert.equal(context.req.cookies.locale, 'de-DE');
});

test('chat events match the subscription schema expected by the frontend', () => {
  const event = {
    messageId: 'message-1',
    conversationId: 'conversation-1',
    senderId: 'user-1',
    body: 'Hallo',
    contentType: 'TEXT',
    channel: 'INTERNAL',
    deliveryStatus: 'SENT',
    createdAt: '2026-07-23T10:00:00.000Z',
    editedAt: null,
    deletedAt: null,
  };

  assert.equal(toChatMessage(event).id, 'message-1');
  assert.deepEqual(toChatConversation(JSON.stringify(event)), {
    id: 'conversation-1',
    channel: 'INTERNAL',
    lastMessage: 'Hallo',
    lastMessageAt: '2026-07-23T10:00:00.000Z',
    unreadCount: 0,
    externalAddress: undefined,
    externalDisplayName: undefined,
    participants: [],
  });
});

test('Valkey iterator shares a channel and unsubscribes after its last listener', async () => {
  let handler;
  let releaseSubscribe;
  const subscribeCalls = [];
  const unsubscribeCalls = [];
  const valkey = {
    async publish() {},
    async subscribe(channel, nextHandler) {
      subscribeCalls.push(channel);
      await new Promise((resolve) => {
        releaseSubscribe = resolve;
      });
      handler = nextHandler;
    },
    async unsubscribe(channel) {
      unsubscribeCalls.push(channel);
    },
  };
  const adapter = new GraphQLValkeyPubSubAdapter(valkey);
  const first = adapter.asyncIterator('chat:conversation:1');
  const second = adapter.asyncIterator('chat:conversation:1');
  const firstResult = first.next();
  const secondResult = second.next();

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(subscribeCalls, ['chat:conversation:1']);
  releaseSubscribe();
  await new Promise((resolve) => setImmediate(resolve));
  handler({ id: 'message-1' });
  assert.deepEqual(await firstResult, { value: { id: 'message-1' }, done: false });
  assert.deepEqual(await secondResult, { value: { id: 'message-1' }, done: false });

  await first.return();
  assert.deepEqual(unsubscribeCalls, []);
  await second.return();
  assert.deepEqual(unsubscribeCalls, ['chat:conversation:1']);
});

test('a rejected chat participant never opens a Valkey listener', async () => {
  const channels = [];
  const resolver = new UserSignupSubscriptionResolver(
    {
      asyncIterator(channel) {
        channels.push(channel);
        return { next: async () => ({ done: true }) };
      },
    },
    {
      async assertParticipant() {
        throw new Error('Conversation access denied');
      },
    },
  );

  await assert.rejects(
    resolver.messageReceived('conversation-1', { id: 'rachel' }),
    /access denied/,
  );
  assert.deepEqual(channels, []);
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
