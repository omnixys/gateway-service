/* eslint-disable @typescript-eslint/no-explicit-any */

import { Injectable } from '@nestjs/common';
import { ValkeyPubSubService } from '@omnixys/cache';
import { getLogger } from '@omnixys/logger';
import { PubSubEngine } from 'graphql-subscriptions';

type Listener = (payload: any) => void;

interface TriggerState {
  listeners: Set<Listener>;
  subscribed: boolean;
  transition: Promise<void>;
}

interface PendingResult<T> {
  resolve: (result: IteratorResult<T>) => void;
}

@Injectable()
export class GraphQLValkeyPubSubAdapter extends PubSubEngine {
  private readonly logger = getLogger(GraphQLValkeyPubSubAdapter.name);
  private readonly triggers = new Map<string, TriggerState>();

  constructor(private readonly valkey: ValkeyPubSubService) {
    super();
  }

  async publish(trigger: string, payload: any): Promise<void> {
    await this.valkey.publish(trigger, payload);
  }

  subscribe(): Promise<number> {
    return Promise.resolve(0);
  }

  unsubscribe(_id: number): void {
    return;
  }

  asyncIterator<T>(trigger: string): AsyncIterableIterator<T> {
    const queue: T[] = [];
    const pending: Array<PendingResult<T>> = [];
    let active = true;

    const listener: Listener = (payload) => {
      if (!active) {
        return;
      }
      const waiter = pending.shift();
      if (waiter) {
        waiter.resolve({ value: payload as T, done: false });
        return;
      }
      queue.push(payload as T);
    };

    const { state, ready } = this.acquire(trigger, listener);

    const close = async (): Promise<IteratorResult<T>> => {
      if (!active) {
        return { value: undefined, done: true };
      }
      active = false;
      queue.length = 0;
      for (const waiter of pending.splice(0)) {
        waiter.resolve({ value: undefined, done: true });
      }
      await this.release(trigger, state, listener);
      return { value: undefined, done: true };
    };

    return {
      next: async (): Promise<IteratorResult<T>> => {
        await ready;
        if (!active) {
          return { value: undefined, done: true };
        }
        const value = queue.shift();
        if (value !== undefined) {
          return { value, done: false };
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          pending.push({ resolve });
        });
      },
      return: close,
      throw: async (error?: unknown): Promise<IteratorResult<T>> => {
        await close();
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  private acquire(
    trigger: string,
    listener: Listener,
  ): {
    state: TriggerState;
    ready: Promise<void>;
  } {
    let state = this.triggers.get(trigger);
    if (!state) {
      state = {
        listeners: new Set<Listener>(),
        subscribed: false,
        transition: Promise.resolve(),
      };
      this.triggers.set(trigger, state);
    }
    state.listeners.add(listener);
    state.transition = state.transition
      .catch(() => undefined)
      .then(async () => {
        if (state.listeners.size === 0 || state.subscribed) {
          return;
        }
        this.logger.debug(
          { trigger, listenerCount: state.listeners.size },
          'valkey_subscribe',
        );
        await this.valkey.subscribe(trigger, (payload) => {
          for (const currentListener of state.listeners) {
            currentListener(payload);
          }
        });
        state.subscribed = true;
      });
    return { state, ready: state.transition };
  }

  private release(
    trigger: string,
    state: TriggerState,
    listener: Listener,
  ): Promise<void> {
    state.listeners.delete(listener);
    state.transition = state.transition
      .catch(() => undefined)
      .then(async () => {
        if (state.listeners.size === 0 && state.subscribed) {
          this.logger.debug(
            { trigger, remainingListeners: state.listeners.size },
            'valkey_unsubscribe',
          );
          await this.valkey.unsubscribe(trigger);
          state.subscribed = false;
        }
        if (state.listeners.size === 0 && !state.subscribed) {
          this.triggers.delete(trigger);
        }
      });
    return state.transition;
  }
}
