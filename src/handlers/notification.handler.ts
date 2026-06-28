/**
 * @license GPL-3.0-or-later
 */

import { UserSignedUpPayload } from '../subscriptions/models/payloads/user-signup.payload.js';
import {
  MessageDirection,
  WhatsAppMessage,
} from '../subscriptions/models/payloads/whatsapp-message.payload.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { WhatsAppMessageDTO } from '@omnixys/contracts';
import {
  IKafkaEventContext,
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from '@omnixys/kafka';
import { OmnixysLogger } from '@omnixys/logger';
import { PubSubEngine } from 'graphql-subscriptions';

/**
 * Kafka → GraphQL Subscription bridge.
 *
 * Responsibilities:
 * - Consume Kafka event
 * - Transform payload
 * - Publish via GraphQL PubSub
 *
 * Design:
 * - One method per topic
 * - No switch/case
 * - Fully typed envelope
 */
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

  /**
   * =========================
   * GATEWAY → SEND CREDENTIALS
   * =========================
   */
  @KafkaEvent(KafkaTopics.gateway.sendCredentials)
  async handleSendCredentials(
    payload: UserSignedUpPayload,
    _context: IKafkaEventContext,
  ): Promise<void> {
    /**
     * Defensive check:
     * In distributed systems PubSub might be disabled.
     */
    if (!this.pubsub) {
      return;
    }

    /**
     * Log with structured payload for traceability.
     */
    this.logger.debug('Publishing user signup subscription event', {
      userId: payload.userId,
      invitationId: payload.invitationId,
    });

    /**
     * Publish to GraphQL subscription layer.
     *
     * Important:
     * Keep payload flat and client-friendly.
     */
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
    /**
     * Defensive check:
     * In distributed systems PubSub might be disabled.
     */
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
      createdAt: payload.value.createdAt.toDateString(),
    };

    /**
     * Publish to GraphQL subscription layer.
     *
     * Important:
     * Keep payload flat and client-friendly.
     */
    await this.pubsub.publish(`whatsapp.message.${whatsappMessage.chatId}`, {
      whatsappMessage,
    });
  }
}
