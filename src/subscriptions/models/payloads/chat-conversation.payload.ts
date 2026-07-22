import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ChatParticipantPayload {
  @Field()
  userId!: string;
}

@ObjectType()
export class ChatConversationPayload {
  @Field()
  id!: string;

  @Field()
  channel!: string;

  @Field({ nullable: true })
  lastMessage?: string;

  @Field({ nullable: true })
  lastMessageAt?: string;

  @Field(() => Int)
  unreadCount!: number;

  @Field({ nullable: true })
  externalAddress?: string;

  @Field({ nullable: true })
  externalDisplayName?: string;

  @Field(() => [ChatParticipantPayload])
  participants!: ChatParticipantPayload[];
}
