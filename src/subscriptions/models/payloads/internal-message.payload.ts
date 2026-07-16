import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('InternalMessage')
export class InternalMessagePayload {
  @Field(() => ID)
  id!: string;

  @Field()
  conversationId!: string;

  @Field()
  senderId!: string;

  @Field()
  body!: string;

  @Field({ nullable: true })
  priority?: string;

  @Field()
  createdAt!: string;
}
