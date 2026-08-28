import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('ConversationUnread')
export class ConversationUnreadPayload {
  @Field(() => ID)
  conversationId!: string;

  @Field(() => Int)
  unreadCount!: number;

  @Field(() => Int)
  guestUnreadCount!: number;

  @Field()
  eventId!: string;
}
