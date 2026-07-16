import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ChatConversationPayload {
  @Field()
  id!: string;

  @Field({ nullable: true })
  lastMessage?: string;

  @Field({ nullable: true })
  lastMessageAt?: string;
}
