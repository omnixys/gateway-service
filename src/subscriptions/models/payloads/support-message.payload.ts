import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum SupportMessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

registerEnumType(SupportMessageDirection, { name: 'SupportMessageDirection' });

@ObjectType('SupportMessage')
export class SupportMessagePayload {
  @Field(() => ID)
  id!: string;

  @Field()
  conversationId!: string;

  @Field(() => SupportMessageDirection)
  direction!: SupportMessageDirection;

  @Field()
  channel!: string;

  @Field({ nullable: true })
  fromUserId?: string;

  @Field()
  fromGuest!: boolean;

  @Field({ nullable: true })
  body?: string;

  @Field({ nullable: true })
  mediaUrl?: string;

  @Field({ nullable: true })
  mimeType?: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;

  @Field({ nullable: true })
  deliveredAt?: string;

  @Field({ nullable: true })
  readAt?: string;
}
