import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class NotificationReceivedPayload {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  recipientId!: string;

  @Field({ nullable: true })
  title?: string;

  @Field()
  body!: string;

  @Field()
  channel!: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}
