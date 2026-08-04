/**
 * @license GPL-3.0-or-later
 * Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * For more information, visit <https://www.gnu.org/licenses/>.
 */

import 'dotenv/config';
import process from 'node:process';

type EnvValue = string | number | boolean;
interface GetEnvOptions<T extends EnvValue = string> {
  required?: boolean;
  transform?: (value: string) => T;
}

function getEnv(
  key: string,
  fallback?: string,
  options?: GetEnvOptions<string>,
): string;
function getEnv<T extends EnvValue>(
  key: string,
  fallback: string,
  options: GetEnvOptions<T> & { transform: (value: string) => T },
): T;
function getEnv(
  key: string,
  fallback?: string,
  options?: GetEnvOptions,
): EnvValue {
  const raw = process.env[key];
  if (!raw) {
    if (options?.required && process.env.NODE_ENV === 'production') {
      throw new Error(`[ENV] Missing required env: ${key}`);
    }
    return options?.transform && fallback !== undefined
      ? options.transform(fallback)
      : (fallback ?? '');
  }
  return options?.transform ? options.transform(raw) : raw;
}

const toBool = (value: string): boolean => value === 'true';
const toNumber = (value: string): number => Number(value);

/**
 * Environment variable configuration for the Node-based server.
 *
 * This file centralizes all environment parameters provided
 * through `.env` or system variables.
 *
 * @remarks
 * - All values are explicitly typed.
 * - Missing variables get sensible defaults (only for DEV).
 * - Booleans are converted correctly from "true"/"false" strings.
 */
export const env = {
  AUTHENTICATION_URI: getEnv(
    'AUTHENTICATION_URI',
    'http://localhost:7501/graphql',
  ),
  EVENT_URI: getEnv('EVENT_URI', 'http://localhost:7406/graphql'),
  INVITATION_URI: getEnv('INVITATION_URI', 'http://localhost:7407/graphql'),
  INVITATION_ANALYTICS_TENANT_URI: getEnv(
    'INVITATION_ANALYTICS_TENANT_URI',
    'http://localhost:7407/internal/analytics/tenant',
  ),
  TICKET_URI: getEnv('TICKET_URI', 'http://localhost:7408/graphql'),
  NOTIFICATION_URI: getEnv('NOTIFICATION_URI', 'http://localhost:3005/graphql'),
  USER_URI: getEnv('USER_URI', 'http://localhost:7402/graphql'),
  SEAT_URI: getEnv('SEAT_URI', 'http://localhost:7409/graphql'),
  ADDRESS_URI: getEnv('ADDRESS_URI', 'http://localhost:7004/graphql'),
  CHAT_URI: getEnv('CHAT_URI', 'http://localhost:8001/graphql'),
  COMMUNICATION_GATEWAY_URI: getEnv(
    'COMMUNICATION_GATEWAY_URI',
    'http://localhost:8002/graphql',
  ),
  ANALYTICS_URI: getEnv('ANALYTICS_URI', 'http://localhost:7410/graphql'),
  TENANT_URI: getEnv('TENANT_URI', 'http://localhost:7502/graphql'),
  DEFAULT_TENANT_ID: getEnv('DEFAULT_TENANT_ID', ''),

  ANALYTICS_INGESTION_URI: getEnv(
    'ANALYTICS_INGESTION_URI',
    'http://localhost:7410/v1/analytics/batch',
  ),
  ANALYTICS_TOKEN_URI: getEnv(
    'ANALYTICS_TOKEN_URI',
    'http://localhost:7410/v1/analytics/tokens',
  ),
  ANALYTICS_FLAGS_URI: getEnv(
    'ANALYTICS_FLAGS_URI',
    'http://localhost:7410/v1/analytics/flags/evaluate',
  ),
  ANALYTICS_CHECKPOINT_ORIGINS: getEnv(
    'ANALYTICS_CHECKPOINT_ORIGINS',
    'https://checkpoint.omnixys.com,http://localhost:3000',
  ),
  ANALYTICS_WEDDING_ORIGINS: getEnv(
    'ANALYTICS_WEDDING_ORIGINS',
    'https://cgr.omnixys.com,http://localhost:3001',
  ),

  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getEnv('PORT', '4000', { transform: toNumber }),
  SERVICE: getEnv('SERVICE', 'user'),

  SCHEMA_TARGET: getEnv('SCHEMA_TARGET', 'true'),
  HTTPS: getEnv('HTTPS', 'false', { transform: toBool }),
  KEYS_PATH: getEnv('KEYS_PATH', './keys'),

  LOG_DEFAULT: getEnv('LOG_DEFAULT', 'false', { transform: toBool }),
  LOG_DIRECTORY: getEnv('LOG_DIRECTORY', 'log'),
  LOG_FILE_DEFAULT_NAME: getEnv('LOG_FILE_DEFAULT_NAME', 'server.log'),
  LOG_PRETTY: getEnv('LOG_PRETTY', 'false', { transform: toBool }),
  LOG_LEVEL: getEnv('LOG_LEVEL', 'info'),
  LOG_BATCH_ENABLE: getEnv('LOG_BATCH_ENABLE', 'true', { transform: toBool }),
  LOG_BATCH_MAX_SIZE: getEnv('LOG_BATCH_MAX_SIZE', '50', {
    transform: toNumber,
  }),
  LOG_BATCH_FLUSH_INTERVAL: getEnv('LOG_BATCH_FLUSH_INTERVAL', '2000', {
    transform: toNumber,
  }),

  OTEL_URI: getEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318'),
  OTEL_TRANSPORT_MODE: getEnv('OTEL_TRANSPORT_MODE', 'http', {
    required: true,
  }),
  OTEL_SAMPLING_RATIO: getEnv('OTEL_SAMPLING_RATIO', '1', {
    transform: toNumber,
  }),
  TEMPO_URI: getEnv('TEMPO_URI', 'http://localhost:4318'),
  PROMETHEUS_ENABLE: getEnv('PROMETHEUS_ENABLE', 'true', { transform: toBool }),
  PROMETHEUS_PORT: getEnv('PROMETHEUS_PORT', '9464', { transform: toNumber }),

  KAFKA_BROKER: getEnv('KAFKA_BROKER', 'localhost:9092'),
  KAFKA_RETRY: getEnv('KAFKA_RETRY', '5', { transform: toNumber }),
  KAFKA_IDEMPOTENCY_ENABLE: getEnv('KAFKA_IDEMPOTENCY_ENABLE', 'true', {
    transform: toBool,
  }),
  KAFKA_IDEMPOTENCY_TTL: getEnv('KAFKA_IDEMPOTENCY_TTL', '86400', {
    transform: toNumber,
  }),

  VALKEY_URL: getEnv('VALKEY_URL', 'valkey://localhost:6380'),
  VALKEY_PASSWORD: getEnv('VALKEY_PASSWORD', '', { required: true }),

  RATE_LIMIT_ENABLE: getEnv('RATE_LIMIT_ENABLE', 'true', { transform: toBool }),
  RATE_LIMIT_REQUESTS: getEnv('RATE_LIMIT_REQUESTS', '100', {
    transform: toNumber,
  }),
  RATE_LIMIT_WINDOW: getEnv('RATE_LIMIT_WINDOW', '60000', {
    transform: toNumber,
  }),

  KC_CLIENT_SECRET: getEnv('KC_CLIENT_SECRET', '', { required: true }),
  KC_URL: getEnv('KC_URL', 'http://localhost:18080/auth'),
  KC_REALM: getEnv('KC_REALM', 'camunda-platform'),
  KC_CLIENT_ID: getEnv('KC_CLIENT_ID', 'camunda-identity'),
  KC_ADMIN_USERNAME: getEnv('KC_ADMIN_USERNAME', 'admin'),
  KC_ADMIN_PASSWORD: getEnv('KC_ADMIN_PASSWORD', 'admin'),

  COOKIE_SECRET: getEnv('COOKIE_SECRET', 'omnixys-development-secret', {
    required: true,
  }),
  INTERNAL_GATEWAY_TOKEN: getEnv(
    'INTERNAL_GATEWAY_TOKEN',
    'dev-internal-gateway-token',
    { required: true },
  ),
  ENCRYPTION_KEY: getEnv('ENCRYPTION_KEY', '', { required: true }),
  CHAT_SERVICE_API_KEY: getEnv(
    'CHAT_SERVICE_API_KEY',
    'omnixys-chat-local-key',
    { required: true },
  ),
  COMMUNICATION_GATEWAY_API_KEY: getEnv(
    'COMMUNICATION_GATEWAY_API_KEY',
    'omnixys-gateway-local-key',
    { required: true },
  ),

  KEYCLOAK_HEALTH_URL: getEnv('KEYCLOAK_HEALTH_URL', ''),
  TEMPO_HEALTH_URL: getEnv('TEMPO_HEALTH_URL', ''),
  PROMETHEUS_HEALTH_URL: getEnv('PROMETHEUS_HEALTH_URL', ''),

  SUPERGRAPH_RETRY_INITIAL_MS: getEnv('SUPERGRAPH_RETRY_INITIAL_MS', '1000', {
    transform: toNumber,
  }),
  SUPERGRAPH_RETRY_MAX_MS: getEnv('SUPERGRAPH_RETRY_MAX_MS', '10000', {
    transform: toNumber,
  }),
} as const;

// /**
//  * Debug output:
//  * Print all environment variables in non-production environments.
//  */
// if (process.env.NODE_ENV !== 'production') {
//   console.log('================= ENVIRONMENT VARIABLES =================');
//   console.log(JSON.stringify(env, null, 2));
//   console.log('==========================================================');
// }
