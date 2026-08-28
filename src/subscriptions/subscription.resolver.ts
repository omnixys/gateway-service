import { GraphQLValkeyPubSubAdapter } from './adapter/graphql-valkey-pubsub.adapter.js';
import { ChatAccessService } from './chat-access.service.js';
import { ChatConversationPayload } from './models/payloads/chat-conversation.payload.js';
import { ChatMessagePayload } from './models/payloads/chat-message.payload.js';
import { EventConversationsPayload } from './models/payloads/event-conversations.payload.js';
import { InternalMessagePayload } from './models/payloads/internal-message.payload.js';
import { NotificationReceivedPayload } from './models/payloads/notification-received.payload.js';
import { SupportMessagePayload } from './models/payloads/support-message.payload.js';
import { UserSignedUpPayload } from './models/payloads/user-signup.payload.js';
import { SupportAccessService } from './support-access.service.js';
import { Inject, UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver, Subscription } from '@nestjs/graphql';
import { RealmRoleType } from '@omnixys/contracts-ts';
import { getLogger } from '@omnixys/logger-ts';
import {
  CookieAuthGuard,
  CurrentUser,
  type CurrentUserData,
  Public,
  RoleGuard,
  Roles,
} from '@omnixys/security-ts';

interface SupportMessageSubscriptionPayload {
  supportMessage: SupportMessagePayload;
}

export function resolveSupportMessage(
  payload: SupportMessageSubscriptionPayload,
): SupportMessagePayload {
  return payload.supportMessage;
}

interface InternalMessageSubscriptionPayload {
  internalMessage: InternalMessagePayload;
}

interface NotificationReceivedSubscriptionPayload {
  notificationReceived: NotificationReceivedPayload;
}

interface ChatEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  body: string;
  contentType: string;
  channel: string;
  deliveryStatus: string;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
}

function parseChatEvent(payload: unknown): ChatEvent {
  if (typeof payload === 'string') {
    return JSON.parse(payload) as ChatEvent;
  }
  return payload as ChatEvent;
}

export function toChatMessage(payload: unknown): ChatMessagePayload {
  const event = parseChatEvent(payload);
  return {
    id: event.messageId,
    conversationId: event.conversationId,
    senderId: event.senderId,
    body: event.body,
    contentType: event.contentType,
    channel: event.channel,
    deliveryStatus: event.deliveryStatus,
    createdAt: event.createdAt,
    editedAt: event.editedAt,
    deletedAt: event.deletedAt,
  };
}

export function toChatConversation(payload: unknown): ChatConversationPayload {
  const event = parseChatEvent(payload);
  return {
    id: event.conversationId,
    channel: event.channel,
    lastMessage: event.body,
    lastMessageAt: event.createdAt,
    unreadCount: 0,
    externalAddress: undefined,
    externalDisplayName: undefined,
    participants: [],
  };
}

@Resolver()
export class UserSignupSubscriptionResolver {
  readonly #logger = getLogger(UserSignupSubscriptionResolver.name);

  constructor(
    @Inject('PUBSUB') private readonly pubsub: GraphQLValkeyPubSubAdapter,
    private readonly chatAccess: ChatAccessService,
    private readonly supportAccess: SupportAccessService,
  ) {}

  @Query(() => String, { name: 'wsPing' })
  wsPing(): string {
    return 'ok';
  }

  @Subscription(() => UserSignedUpPayload, {
    name: 'userSignedUp',
    resolve: (payload: UserSignedUpPayload): UserSignedUpPayload => payload,
  })
  @UseGuards(CookieAuthGuard, RoleGuard)
  @Roles(RealmRoleType.ADMIN)
  userSignedUp(): AsyncIterator<UserSignedUpPayload> {
    return this.pubsub.asyncIterator<UserSignedUpPayload>('USER_SIGNED_UP');
  }

  @Subscription(() => SupportMessagePayload, {
    resolve: resolveSupportMessage,
  })
  @UseGuards(CookieAuthGuard)
  async supportMessageReceived(
    @Args('conversationId') conversationId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AsyncIterator<SupportMessageSubscriptionPayload>> {
    await this.supportAccess.assertConversationViewer(conversationId, user.id);
    this.#logger.debug({ conversationId }, 'support_message_subscription');
    return this.pubsub.asyncIterator<SupportMessageSubscriptionPayload>(
      `support.message.${conversationId}`,
    );
  }

  @Subscription(() => EventConversationsPayload, {
    name: 'eventConversationsChanged',
    resolve: (payload: EventConversationsPayload): EventConversationsPayload =>
      payload,
  })
  @UseGuards(CookieAuthGuard)
  async eventConversationsChanged(
    @Args('eventId') eventId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AsyncIterator<EventConversationsPayload>> {
    await this.supportAccess.assertEventViewer(eventId, user.id);
    this.#logger.debug(
      { eventId, userId: user.id },
      'event_conversations_subscription',
    );
    return this.pubsub.asyncIterator<EventConversationsPayload>(
      `support.event.conversations.${eventId}`,
    );
  }

  @Subscription(() => SupportMessagePayload, {
    resolve: resolveSupportMessage,
  })
  @Public()
  async rsvpSupportMessageReceived(
    @Args('invitationId') invitationId: string,
  ): Promise<AsyncIterator<SupportMessageSubscriptionPayload>> {
    await this.supportAccess.assertInvitation(invitationId);
    this.#logger.debug(
      { hasInvitation: Boolean(invitationId) },
      'rsvp_support_message_subscription',
    );
    return this.pubsub.asyncIterator<SupportMessageSubscriptionPayload>(
      `support.invitation.message.${invitationId}`,
    );
  }

  @Subscription(() => InternalMessagePayload)
  @UseGuards(CookieAuthGuard)
  internalMessageReceived(
    @CurrentUser() user: CurrentUserData,
  ): AsyncIterator<InternalMessageSubscriptionPayload> {
    this.#logger.debug({ userId: user.id }, 'internal_message_subscription');
    return this.pubsub.asyncIterator<InternalMessageSubscriptionPayload>(
      `internal.message.${user.id}`,
    );
  }

  @Subscription(() => NotificationReceivedPayload)
  @UseGuards(CookieAuthGuard)
  notificationReceived(
    @CurrentUser() user: CurrentUserData,
  ): AsyncIterator<NotificationReceivedSubscriptionPayload> {
    this.#logger.debug({ userId: user.id }, 'notification_subscription');
    return this.pubsub.asyncIterator<NotificationReceivedSubscriptionPayload>(
      `notification.user.${user.id}`,
    );
  }

  @Subscription(() => ChatMessagePayload, {
    name: 'messageReceived',
    resolve: (payload: unknown): ChatMessagePayload => toChatMessage(payload),
  })
  @UseGuards(CookieAuthGuard)
  async messageReceived(
    @Args('conversationId', { type: () => ID }) conversationId: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AsyncIterator<ChatMessagePayload>> {
    await this.chatAccess.assertParticipant(conversationId, user.id);
    this.#logger.debug(
      { conversationId, userId: user.id },
      'chat_message_subscription',
    );
    return this.pubsub.asyncIterator<ChatMessagePayload>(
      `chat:conversation:${conversationId}`,
    );
  }

  @Subscription(() => ChatConversationPayload, {
    name: 'conversationUpdated',
    resolve: (payload: unknown): ChatConversationPayload =>
      toChatConversation(payload),
  })
  @UseGuards(CookieAuthGuard)
  conversationUpdated(
    @CurrentUser() user: CurrentUserData,
  ): AsyncIterator<ChatMessagePayload> {
    this.#logger.debug({ userId: user.id }, 'chat_conversation_subscription');
    return this.pubsub.asyncIterator<ChatMessagePayload>(
      `chat:user:${user.id}`,
    );
  }
}
