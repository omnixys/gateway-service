import { GraphQLValkeyPubSubAdapter } from './adapter/graphql-valkey-pubsub.adapter.js';
import { UserSignedUpPayload } from './models/payloads/user-signup.payload.js';
import { WhatsAppMessage } from './models/payloads/whatsapp-message.payload.js';
import { Inject, UseGuards } from '@nestjs/common';
import { Args, Query, Resolver, Subscription } from '@nestjs/graphql';
import { RealmRoleType } from '@omnixys/contracts';
import { CookieAuthGuard, RoleGuard, Roles } from '@omnixys/security';

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
  @UseGuards(CookieAuthGuard, RoleGuard)
  @Roles(RealmRoleType.ADMIN)
  userSignedUp(): AsyncIterator<UserSignedUpPayload> {
    return this.pubsub.asyncIterator<UserSignedUpPayload>('USER_SIGNED_UP');
  }

  @Subscription(() => WhatsAppMessage)
  @UseGuards(CookieAuthGuard)
  whatsappMessage(
    @Args('chatId') chatId: string,
  ): AsyncIterator<WhatsAppMessageSubscriptionPayload> {
    return this.pubsub.asyncIterator<WhatsAppMessageSubscriptionPayload>(
      `whatsapp.message.${chatId}`,
    );
  }
}
