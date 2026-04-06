/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * @license GPL-3.0-or-later
 */

import { PubSubEngine } from 'graphql-subscriptions';
import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  IKafkaEventContext,
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from '@omnixys/kafka';

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
export class UserSignedUpKafkaHandler {
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
    event: any,
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
      userId: event.userId,
    });

    /**
     * Publish to GraphQL subscription layer.
     *
     * Important:
     * Keep payload flat and client-friendly.
     */
    await this.pubsub.publish('USER_SIGNED_UP', {
      userId: event.serId,
      username: event.username,
      password: event.password,
      invitationId: event.invitationId,
      lastName: event.lastName,
      firstName: event.firstName,
    });
  }
}