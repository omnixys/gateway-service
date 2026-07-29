import { ChatAccessService } from '../../dist/subscriptions/chat-access.service.js';
import { UserSignupSubscriptionResolver } from '../../dist/subscriptions/subscription.resolver.js';
import assert from 'node:assert/strict';
import test from 'node:test';

test('chat access check forwards the configured shared key', async (t) => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url: String(url), options };
    return new Response(null, { status: 204 });
  });

  await new ChatAccessService().assertParticipant('conversation / 1', 'user / 1');

  assert.match(
    request.url,
    /\/api\/v1\/internal\/conversations\/conversation%20%2F%201\/participants\/user%20%2F%201$/,
  );
  assert.ok(request.options.headers['x-api-key']);
});

test('chat access check rejects foreign participants', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(null, { status: 403 }),
  );

  await assert.rejects(
    new ChatAccessService().assertParticipant('conversation-1', 'user-2'),
    (error) => error?.code === 'CONVERSATION_ACCESS_DENIED' && error?.httpStatus === 403,
  );
});

test('message subscription checks participation before opening the Valkey channel', async () => {
  const calls = [];
  const iterator = { next: async () => ({ done: true }) };
  const resolver = new UserSignupSubscriptionResolver(
    {
      asyncIterator(channel) {
        calls.push(['channel', channel]);
        return iterator;
      },
    },
    {
      async assertParticipant(conversationId, userId) {
        calls.push(['access', conversationId, userId]);
      },
    },
  );

  assert.equal(
    await resolver.messageReceived('conversation-1', { id: 'user-1' }),
    iterator,
  );
  assert.deepEqual(calls, [
    ['access', 'conversation-1', 'user-1'],
    ['channel', 'chat:conversation:conversation-1'],
  ]);
});
