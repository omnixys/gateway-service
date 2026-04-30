/**
 * @license GPL-3.0-or-later
 */

import { UserSignedUpPayload } from '../subscriptions/models/payloads/user-signup.payload.js';
import {
  MessageDirection,
  WhatsAppMessage,
} from '../subscriptions/models/payloads/whatsapp-message.payload.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  IKafkaEventContext,
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from '@omnixys/kafka';
import { WhatsAppMessageDTO } from '@omnixys/shared';
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
  constructor(
    @Optional()
    @Inject('PUBSUB')
    private readonly pubsub: PubSubEngine,
  ) {}

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
    console.debug('Publishing USER_SIGNED_UP event', {
      payload,
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
      password: payload.password,
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

    console.debug(
      'Publishing whatsapp.message event message=',
      payload.value.body,
    );

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
