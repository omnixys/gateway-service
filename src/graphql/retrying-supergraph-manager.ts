import type { SupergraphManager } from '@apollo/gateway';

const MAX_TIMER_MS = 2_147_483_647;

type InitializeOptions = Parameters<SupergraphManager['initialize']>[0];
type InitializeResult = Awaited<ReturnType<SupergraphManager['initialize']>>;

export interface SupergraphRetryEvent {
  attempt: number;
  delayMs: number;
  error: unknown;
}

export interface RetryingSupergraphManagerOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (event: SupergraphRetryEvent) => void;
}

function clampTimer(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), MAX_TIMER_MS);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message} ${error.cause ? errorMessage(error.cause) : ''}`;
  }
  return String(error);
}

export function isTransientSupergraphError(error: unknown): boolean {
  const message = errorMessage(error);
  return /ECONNREFUSED|ECONNRESET|ECONNABORTED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_|fetch failed|network error|socket hang up|timed?\s*out|HTTP(?: status(?: code)?)?\s*5\d{2}|\b5(?:00|02|03|04)\b/i.test(
    message,
  );
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Retries only transient startup failures. Once Apollo has initialized, its
 * normal IntrospectAndCompose polling and cleanup behavior remain unchanged.
 */
export class RetryingSupergraphManager implements SupergraphManager {
  readonly #delegate: SupergraphManager;
  readonly #initialDelayMs: number;
  readonly #maxDelayMs: number;
  readonly #sleep: (delayMs: number) => Promise<void>;
  readonly #onRetry?: (event: SupergraphRetryEvent) => void;

  constructor(
    delegate: SupergraphManager,
    options: RetryingSupergraphManagerOptions = {},
  ) {
    this.#delegate = delegate;
    this.#initialDelayMs = clampTimer(options.initialDelayMs ?? 1_000, 1_000);
    this.#maxDelayMs = Math.max(
      this.#initialDelayMs,
      clampTimer(options.maxDelayMs ?? 10_000, 10_000),
    );
    this.#sleep = options.sleep ?? defaultSleep;
    this.#onRetry = options.onRetry;
  }

  async initialize(options: InitializeOptions): Promise<InitializeResult> {
    let attempt = 0;
    let delayMs = this.#initialDelayMs;

    for (;;) {
      try {
        return await this.#delegate.initialize(options);
      } catch (error) {
        if (!isTransientSupergraphError(error)) {
          throw error;
        }

        attempt += 1;
        this.#onRetry?.({ attempt, delayMs, error });
        await this.#sleep(delayMs);
        delayMs = Math.min(delayMs * 2, this.#maxDelayMs, MAX_TIMER_MS);
      }
    }
  }
}
