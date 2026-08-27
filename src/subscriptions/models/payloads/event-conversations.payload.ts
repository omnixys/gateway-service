import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Realtime event-scoped conversation-change notification for staff lists.
 * Published by the notification-service to the `support.event.conversations.{eventId}`
 * Valkey channel; optional fields are populated depending on the `kind`.
 */
@ObjectType('EventConversationsUpdate')
export class EventConversationsPayload {
  @Field(() => ID)
  eventId!: string;

  @Field(() => ID)
  conversationId!: string;

  @Field()
  kind!: string;

  @Field({ nullable: true })
  status?: string;

  @Field({ nullable: true })
  channel?: string;

  @Field({ nullable: true })
  guestName?: string;

  @Field({ nullable: true })
  unreadCount?: number;

  @Field({ nullable: true })
  assignedTo?: string;
}
