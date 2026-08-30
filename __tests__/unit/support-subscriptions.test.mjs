import assert from 'node:assert/strict';
import test from 'node:test';
import { KafkaTopics } from '@omnixys/kafka-ts';

process.env.INTERNAL_GATEWAY_TOKEN =
  process.env.TEST_INTERNAL_GATEWAY_TOKEN ?? 'dev-internal-gateway-token';
process.env.NOTIFICATION_URI = 'http://notification.test/graphql';
process.env.INVITATION_URI = 'http://invitation.test/graphql';

const { SupportAccessService } = await import(
  '../../dist/subscriptions/support-access.service.js'
);
const { resolveSupportMessage, UserSignupSubscriptionResolver } = await import(
  '../../dist/subscriptions/subscription.resolver.js'
);
const { NotificationHandler } = await import('../../dist/handlers/notification.handler.js');

test('support handler registers both guest and agent reply topics', () => {
  const metadataKeys = Reflect.getMetadataKeys(NotificationHandler.prototype.handleSupportMessage);
  const kafkaMetadata = metadataKeys
    .map((key) => Reflect.getMetadata(key, NotificationHandler.prototype.handleSupportMessage))
    .find((value) => Array.isArray(value?.topics));

  assert.deepEqual(new Set(kafkaMetadata?.topics), new Set([
    KafkaTopics.conversation.agentReplied,
    KafkaTopics.conversation.guestReplied,
  ]));
});

test('support subscriptions resolve the published supportMessage envelope', () => {
  const supportMessage = {
    id: 'message-1',
    conversationId: 'conversation-1',
    direction: 'OUTBOUND',
    channel: 'WEBCHAT',
    fromUserId: 'support-1',
    fromGuest: false,
    body: 'Guten Tag',
    status: 'DELIVERED',
    createdAt: '2026-08-28T10:00:00.000Z',
  };

  assert.equal(resolveSupportMessage({ supportMessage }), supportMessage);
});

test('SupportAccessService validates event viewers through the notification service', async () => {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (input, init) => {
    request = { input: String(input), init };
    return new Response('{}', { status: 200 });
  };
  try {
    const service = new SupportAccessService({ hit: async () => true });
    await service.assertEventViewer('event-1', 'user-1');

    const url = new URL(request.input);
    assert.equal(url.pathname, '/internal/support/access/event');
    assert.equal(url.searchParams.get('eventId'), 'event-1');
    assert.equal(url.searchParams.get('userId'), 'user-1');
    assert.equal(request.init.headers['x-internal-token'], 'dev-internal-gateway-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SupportAccessService rejects denied conversation access fail-closed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 403 });
  try {
    const service = new SupportAccessService({ hit: async () => true });
    await assert.rejects(
      service.assertConversationViewer('conversation-1', 'outsider'),
      /denied/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SupportAccessService rate-limits RSVP subscription capabilities before lookup', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  };
  try {
    const service = new SupportAccessService({ hit: async () => false });
    await assert.rejects(service.assertInvitation('invitation-secret'), /too many/i);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('subscription resolver authorizes each support scope before subscribing', async () => {
  const subscribed = [];
  const pubsub = {
    asyncIterator: (channel) => {
      subscribed.push(channel);
      return { [Symbol.asyncIterator]() { return this; } };
    },
  };
  const calls = [];
  const access = {
    assertConversationViewer: async (conversationId, userId) => {
      calls.push(['conversation', conversationId, userId]);
    },
    assertEventViewer: async (eventId, userId) => {
      calls.push(['event', eventId, userId]);
    },
    assertInvitation: async (invitationId) => {
      calls.push(['invitation', invitationId]);
    },
  };
  const resolver = new UserSignupSubscriptionResolver(pubsub, {}, access);

  await resolver.supportMessageReceived('conversation-1', { id: 'guest-1' });
  await resolver.eventConversationsChanged('event-1', { id: 'staff-1' });
  await resolver.rsvpSupportMessageReceived('invitation-1');

  assert.deepEqual(calls, [
    ['conversation', 'conversation-1', 'guest-1'],
    ['event', 'event-1', 'staff-1'],
    ['invitation', 'invitation-1'],
  ]);
  assert.deepEqual(subscribed, [
    'support.message.conversation-1',
    'support.event.conversations.event-1',
    'support.invitation.message.invitation-1',
  ]);
});
