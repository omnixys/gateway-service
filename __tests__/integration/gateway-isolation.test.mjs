import { handleAuth } from '../../dist/app.module.js';
import { GraphQLValkeyPubSubAdapter } from '../../dist/subscriptions/adapter/graphql-valkey-pubsub.adapter.js';
import { UserSignupSubscriptionResolver } from '../../dist/subscriptions/subscription.resolver.js';
import { ContextAccessor } from '@omnixys/context';
import assert from 'node:assert/strict';
import test from 'node:test';

test('parallel gateway requests retain isolated request identifiers', async () => {
  const run = (requestId, delay) =>
    ContextAccessor.run(
      { requestId, correlationId: `correlation-${requestId}` },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return handleAuth({ headers: {}, body: { query: 'query { me { id } }' } });
      },
    );

  const [first, second] = await Promise.all([
    run('first', 10),
    run('second', 1),
  ]);
  assert.equal(first.requestId, 'first');
  assert.equal(second.requestId, 'second');
  assert.equal(first.correlationId, 'correlation-first');
  assert.equal(second.correlationId, 'correlation-second');
});

test('two chat participants receive the event and a third user opens no listener', async () => {
  let valkeyHandler;
  const subscriptions = [];
  const valkey = {
    async publish() {},
    async subscribe(channel, handler) {
      subscriptions.push(channel);
      valkeyHandler = handler;
    },
    async unsubscribe() {},
  };
  const allowedUsers = new Set(['admin', 'caleb']);
  const resolver = new UserSignupSubscriptionResolver(
    new GraphQLValkeyPubSubAdapter(valkey),
    {
      async assertParticipant(_conversationId, userId) {
        if (!allowedUsers.has(userId)) {
          throw new Error('Conversation access denied');
        }
      },
    },
  );

  const admin = await resolver.messageReceived('conversation-1', { id: 'admin' });
  const caleb = await resolver.messageReceived('conversation-1', { id: 'caleb' });
  await assert.rejects(
    resolver.messageReceived('conversation-1', { id: 'rachel' }),
    /access denied/,
  );

  const adminResult = admin.next();
  const calebResult = caleb.next();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(subscriptions, ['chat:conversation:conversation-1']);
  valkeyHandler({ messageId: 'message-1' });
  assert.deepEqual(await adminResult, {
    value: { messageId: 'message-1' },
    done: false,
  });
  assert.deepEqual(await calebResult, {
    value: { messageId: 'message-1' },
    done: false,
  });

  await admin.return();
  await caleb.return();
});
