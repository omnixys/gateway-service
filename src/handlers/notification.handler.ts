import { InternalMessagePayload } from '../subscriptions/models/payloads/internal-message.payload.js';
import {
  SupportMessageDirection,
  SupportMessagePayload,
} from '../subscriptions/models/payloads/support-message.payload.js';
import { UserSignedUpPayload } from '../subscriptions/models/payloads/user-signup.payload.js';
import {
  MessageDirection,
  WhatsAppMessage,
} from '../subscriptions/models/payloads/whatsapp-message.payload.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  InternalMessageSentDTO,
  SupportMessageReceivedDTO,
  WhatsAppMessageDTO,
} from '@omnixys/contracts';
import {
  IKafkaEventContext,
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from '@omnixys/kafka';
import { OmnixysLogger } from '@omnixys/logger';
import { PubSubEngine } from 'graphql-subscriptions';

type KafkaDateValue = Date | number | string | null | undefined;

export function normalizeKafkaDate(value: KafkaDateValue): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

@KafkaEventHandler('notification')
@Injectable()
export class NotificationHandler {
  private readonly logger;

  constructor(
    @Optional()
    @Inject('PUBSUB')
    private readonly pubsub: PubSubEngine,
    logger: OmnixysLogger,
  ) {
    this.logger = logger.log(this.constructor.name);
  }

  @KafkaEvent(KafkaTopics.gateway.sendCredentials)
  async handleSendCredentials(
    payload: UserSignedUpPayload,
    _context: IKafkaEventContext,
  ): Promise<void> {
    if (!this.pubsub) {
      return;
    }
    this.logger.debug('Publishing user signup subscription event', {
      userId: payload.userId,
      invitationId: payload.invitationId,
    });
    await this.pubsub.publish('USER_SIGNED_UP', {
      userId: payload.userId,
      username: payload.username,
      invitationId: payload.invitationId,
      lastName: payload.lastName,
      firstName: payload.firstName,
    });
  }

  @KafkaEvent(KafkaTopics.gateway.createWhatsappMessage)
  async handleMessageCreated(
    payload: WhatsAppMessageDTO,
    _context: IKafkaEventContext,
  ): Promise<void> {
    if (!this.pubsub) {
      return;
    }
    this.logger.debug('Publishing WhatsApp subscription event', {
      messageId: payload.value.id,
      chatId: payload.value.chatId,
    });
    const whatsappMessage: WhatsAppMessage = {
      id: payload.value.id,
      chatId: payload.value.chatId,
      direction: payload.value.direction as MessageDirection,
      from: payload.value.from,
      to: payload.value.to,
      body: payload.value.body ?? undefined,
      createdAt: normalizeKafkaDate(payload.value.createdAt),
    };
    await this.pubsub.publish(`whatsapp.message.${whatsappMessage.chatId}`, {
      whatsappMessage,
    });
  }

  @KafkaEvent(KafkaTopics.conversation.internalMessage)
  async handleInternalMessage(
    payload: InternalMessageSentDTO,
    _context: IKafkaEventContext,
  ): Promise<void> {
    if (!this.pubsub) {
      return;
    }
    this.logger.debug('Publishing internal message subscription event', {
      conversationId: payload.conversationId,
      messageId: payload.id,
      participantIds: payload.participantIds,
    });
    const internalMessage: InternalMessagePayload = {
      id: payload.id,
      conversationId: payload.conversationId,
      senderId: payload.senderId,
      body: payload.body,
      priority: payload.priority,
      createdAt: payload.createdAt,
    };
    // Publish to each participant's personal channel for secure per-user delivery
    const targets = payload.participantIds ?? [];
    if (targets.length === 0) {
      await this.pubsub.publish(`internal.message.${payload.conversationId}`, {
        internalMessage,
      });
      return;
    }
    await Promise.all(
      targets.map((userId) =>
        this.pubsub.publish(`internal.message.${userId}`, { internalMessage }),
      ),
    );
  }

  @KafkaEvent(KafkaTopics.conversation.agentReplied)
  @KafkaEvent(KafkaTopics.conversation.guestReplied)
  async handleSupportMessage(
    payload: SupportMessageReceivedDTO,
    _context: IKafkaEventContext,
  ): Promise<void> {
    if (!this.pubsub) {
      return;
    }
    this.logger.debug('Publishing support message subscription event', {
      conversationId: payload.conversationId,
      messageId: payload.id,
    });
    const supportMessage: SupportMessagePayload = {
      id: payload.id,
      conversationId: payload.conversationId,
      direction:
        payload.direction === 'INBOUND'
          ? SupportMessageDirection.INBOUND
          : SupportMessageDirection.OUTBOUND,
      channel: payload.channel,
      fromUserId: payload.fromUserId,
      fromGuest: payload.fromGuest,
      body: payload.body,
      mediaUrl: payload.mediaUrl,
      mimeType: payload.mimeType,
      status: payload.status,
      createdAt: payload.createdAt,
    };
    await this.pubsub.publish(`support.message.${payload.conversationId}`, {
      supportMessage,
    });
  }
}
