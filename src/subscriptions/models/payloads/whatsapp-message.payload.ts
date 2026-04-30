import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

/**
 * Message direction enum.
 *
 * Must be registered for GraphQL schema generation.
 */
export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

/**
 * Register enum in GraphQL schema.
 */
registerEnumType(MessageDirection, {
  name: 'MessageDirection',
});

/**
 * WhatsAppMessage GraphQL ObjectType
 *
 * Represents a single message flowing through the system.
 *
 * This model is used by:
 * - Queries
 * - Mutations
 * - Subscriptions (CRITICAL)
 */
@ObjectType('WhatsAppMessage')
export class WhatsAppMessage {
  /**
   * Internal database identifier
   */
  @Field(() => ID)
  id!: string;

  /**
   * Logical chat identifier (lid or phone-based)
   */
  @Field()
  chatId!: string;

  /**
   * Message direction (INBOUND / OUTBOUND)
   */
  @Field(() => MessageDirection)
  direction!: MessageDirection;

  /**
   * Sender identifier
   */
  @Field()
  from!: string;

  /**
   * Receiver identifier
   */
  @Field()
  to!: string;

  /**
   * Message body text
   */
  @Field({ nullable: true })
  body?: string;

  /**
   * Optional media URL (image, video, etc.)
   */
  @Field({ nullable: true })
  mediaUrl?: string;

  /**
   * WhatsApp message ID (external system)
   */
  @Field({ nullable: true })
  messageId?: string;

  /**
   * Delivery status (optional, used for ACK updates)
   */
  @Field({ nullable: true })
  status?: string;

  /**
   * Creation timestamp
   */
  @Field(() => String, { nullable: true })
  createdAt?: string;
}
