import { GraphQLValkeyPubSubAdapter } from './adapter/graphql-valkey-pubsub.adapter.js';
import { UserSignedUpPayload } from './models/payloads/user-signup.payload.js';
import { WhatsAppMessage } from './models/payloads/whatsapp-message.payload.js';
import { Inject } from '@nestjs/common';
import { Args, Query, Resolver, Subscription } from '@nestjs/graphql';

interface WhatsAppMessageSubscriptionPayload {
  whatsappMessage: WhatsAppMessage;
}

@Resolver()
export class UserSignupSubscriptionResolver {
  constructor(
    @Inject('PUBSUB') private readonly pubsub: GraphQLValkeyPubSubAdapter,
  ) {}

  @Query(() => String, { name: 'wsPing' })
  wsPing(): string {
    return 'ok';
  }

  @Subscription(() => UserSignedUpPayload, {
    name: 'userSignedUp',
    resolve: (payload: UserSignedUpPayload): UserSignedUpPayload => payload,
  })
  userSignedUp(): AsyncIterator<UserSignedUpPayload> {
    return this.pubsub.asyncIterator<UserSignedUpPayload>('USER_SIGNED_UP');
  }

  @Subscription(() => WhatsAppMessage)
  whatsappMessage(
    @Args('chatId') chatId: string,
  ): AsyncIterator<WhatsAppMessageSubscriptionPayload> {
    return this.pubsub.asyncIterator<WhatsAppMessageSubscriptionPayload>(
      `whatsapp.message.${chatId}`,
    );
  }
}
