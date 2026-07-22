import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ChatMessagePayload {
  @Field()
  id!: string;

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

  @Field({ nullable: true })
  editedAt?: string;

  @Field({ nullable: true })
  deletedAt?: string;
}
