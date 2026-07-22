import { GraphQLValkeyPubSubAdapter } from './adapter/graphql-valkey-pubsub.adapter.js';
import { ChatAccessService } from './chat-access.service.js';
import { ChatConversationPayload } from './models/payloads/chat-conversation.payload.js';
import { ChatMessagePayload } from './models/payloads/chat-message.payload.js';
import { ConversationUnreadPayload } from './models/payloads/conversation-unread.payload.js';
import { InternalMessagePayload } from './models/payloads/internal-message.payload.js';
import { NotificationReceivedPayload } from './models/payloads/notification-received.payload.js';
import { SupportMessagePayload } from './models/payloads/support-message.payload.js';
import { UserSignedUpPayload } from './models/payloads/user-signup.payload.js';
import { WhatsAppMessage } from './models/payloads/whatsapp-message.payload.js';
import { Inject, UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver, Subscription } from '@nestjs/graphql';
import { RealmRoleType } from '@omnixys/contracts';
import {
  CookieAuthGuard,
  CurrentUser,
  type CurrentUserData,
  RoleGuard,
  Roles,
} from '@omnixys/security';

interface WhatsAppMessageSubscriptionPayload {
  whatsappMessage: WhatsAppMessage;
}

interface SupportMessageSubscriptionPayload {
  supportMessage: SupportMessagePayload;
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
  constructor(
    @Inject('PUBSUB') private readonly pubsub: GraphQLValkeyPubSubAdapter,
    private readonly chatAccess: ChatAccessService,
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

  @Subscription(() => WhatsAppMessage)
  @UseGuards(CookieAuthGuard)
  whatsappMessage(
    @Args('chatId') chatId: string,
  ): AsyncIterator<WhatsAppMessageSubscriptionPayload> {
    return this.pubsub.asyncIterator<WhatsAppMessageSubscriptionPayload>(
      `whatsapp.message.${chatId}`,
    );
  }

  @Subscription(() => SupportMessagePayload)
  @UseGuards(CookieAuthGuard)
  supportMessageReceived(
    @Args('conversationId') conversationId: string,
  ): AsyncIterator<SupportMessageSubscriptionPayload> {
    return this.pubsub.asyncIterator<SupportMessageSubscriptionPayload>(
      `support.message.${conversationId}`,
    );
  }

  @Subscription(() => ConversationUnreadPayload)
  @UseGuards(CookieAuthGuard)
  conversationUnreadUpdated(
    @Args('conversationId') conversationId: string,
  ): AsyncIterator<ConversationUnreadPayload> {
    return this.pubsub.asyncIterator<ConversationUnreadPayload>(
      `unreadCount.updated.${conversationId}`,
    );
  }

  @Subscription(() => InternalMessagePayload)
  @UseGuards(CookieAuthGuard)
  internalMessageReceived(
    @CurrentUser() user: CurrentUserData,
  ): AsyncIterator<InternalMessageSubscriptionPayload> {
    return this.pubsub.asyncIterator<InternalMessageSubscriptionPayload>(
      `internal.message.${user.id}`,
    );
  }

  @Subscription(() => NotificationReceivedPayload)
  @UseGuards(CookieAuthGuard)
  notificationReceived(
    @CurrentUser() user: CurrentUserData,
  ): AsyncIterator<NotificationReceivedSubscriptionPayload> {
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
    return this.pubsub.asyncIterator<ChatMessagePayload>(
      `chat:user:${user.id}`,
    );
  }
}
