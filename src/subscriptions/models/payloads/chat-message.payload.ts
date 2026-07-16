import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ChatMessagePayload {
  @Field()
  messageId!: string;

  @Field()
  conversationId!: string;

  @Field()
  senderId!: string;

  @Field()
  body!: string;

  @Field()
  contentType!: string;

  @Field()
  channel!: string;

  @Field()
  deliveryStatus!: string;

  @Field()
  createdAt!: string;
}
