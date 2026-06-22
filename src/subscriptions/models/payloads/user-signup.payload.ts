import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class UserSignedUpPayload {
  @Field(() => ID)
  userId!: string;

  @Field()
  username!: string;

  @Field({
    nullable: true,
    deprecationReason: 'Credentials are never exposed through subscriptions',
  })
  password?: string;

  @Field()
  invitationId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;
}
