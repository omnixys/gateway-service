// /backend/gateway/src/subscriptions/subscription.module.ts

import { GraphQLValkeyPubSubAdapter } from './adapter/graphql-valkey-pubsub.adapter.js';
import { ChatAccessService } from './chat-access.service.js';
import { UserSignupSubscriptionResolver } from './subscription.resolver.js';
import { SupportAccessService } from './support-access.service.js';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

interface SubscriptionRequest {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}

interface SubscriptionContextInput {
  req?: SubscriptionRequest;
  extra?: { request?: SubscriptionRequest };
}

function parseCookieHeader(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    value.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) {
        return [];
      }
      const name = part.slice(0, separator).trim();
      const rawValue = part.slice(separator + 1).trim();
      try {
        return [[name, decodeURIComponent(rawValue)]];
      } catch {
        return [[name, rawValue]];
      }
    }),
  );
}

export function createSubscriptionContext(input: SubscriptionContextInput): {
  req?: SubscriptionRequest;
} {
  const req = input.req ?? input.extra?.request;
  if (!req) {
    return {};
  }

  const cookieHeader = req.headers.cookie;
  const serializedCookies = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  req.cookies = {
    ...parseCookieHeader(serializedCookies),
    ...req.cookies,
  };

  return { req };
}

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: '/ws',
      autoSchemaFile: true,
      sortSchema: true,
      playground: false,
      context: createSubscriptionContext,
      subscriptions: {
        'graphql-ws': {
          path: '/ws',
        },
      },
    }),
  ],

  providers: [
    UserSignupSubscriptionResolver,
    GraphQLValkeyPubSubAdapter,
    ChatAccessService,
    SupportAccessService,
    {
      provide: 'PUBSUB',
      useExisting: GraphQLValkeyPubSubAdapter,
    },
  ],

  exports: ['PUBSUB', GraphQLValkeyPubSubAdapter],
})
export class SubscriptionServerModule {}
