import { UserSignedUpPayload } from './models/payloads/user-signup.payload.js';
import { Inject } from '@nestjs/common';
import { Query, Resolver, Subscription } from '@nestjs/graphql';

@Resolver()
export class UserSignupSubscriptionResolver {
  constructor(@Inject('PUBSUB') private readonly pubsub: any) {}

  @Query(() => String, { name: 'wsPing' })
  wsPing(): string {
    return 'ok';
  }

  @Subscription(() => UserSignedUpPayload, {
    name: 'userSignedUp',
    resolve: (payload) => payload,
  })
  userSignedUp() {
    return this.pubsub.asyncIterator('USER_SIGNED_UP');
  }
}
