// /backend/gateway/src/subscriptions/subscription.module.ts

import { GraphQLValkeyPubSubAdapter } from './adapter/graphql-valkey-pubsub.adapter.js';
import { UserSignupSubscriptionResolver } from './subscription.resolver.js';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: '/ws',
      autoSchemaFile: true,
      sortSchema: true,
      playground: false,
      subscriptions: {
        'graphql-ws': {
          path: '/ws',
          onConnect: async () => {
            // Token validierung optional
          },
        },
      },
    }),
  ],

  providers: [
    UserSignupSubscriptionResolver,
    GraphQLValkeyPubSubAdapter,
    {
      provide: 'PUBSUB',
      useExisting: GraphQLValkeyPubSubAdapter,
    },
  ],

  exports: ['PUBSUB', GraphQLValkeyPubSubAdapter],
})
export class SubscriptionServerModule {}
