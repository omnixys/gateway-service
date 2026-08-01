import { InternalMessagePayload } from '../subscriptions/models/payloads/internal-message.payload.js';
import {
  SupportMessageDirection,
  SupportMessagePayload,
} from '../subscriptions/models/payloads/support-message.payload.js';
import { UserSignedUpPayload } from '../subscriptions/models/payloads/user-signup.payload.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  InternalMessageSentDTO,
  SupportMessageReceivedDTO,
} from '@omnixys/contracts-ts';
import {
  IKafkaEventContext,
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from '@omnixys/kafka-ts';
import { OmnixysLogger } from '@omnixys/logger-ts';
import { PubSubEngine } from 'graphql-subscriptions';

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
