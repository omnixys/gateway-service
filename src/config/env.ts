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

const MAX_TIMER_MS = 2_147_483_647;

function positiveTimerMs(key: string, fallback: number): number {
  const parsed = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), MAX_TIMER_MS);
}

function secret(key: string, fallback: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`[ENV] Missing required env: ${key}`);
  }
  return value ?? fallback;
}

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
  /**
   * Environment type:
   * - `production` → Cloud/Production mode
   * - `development` → Local development
   * - `test` → Test execution
   */
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  SCHEMA_TARGET: process.env.SCHEMA_TARGET ?? 'true',

  /** Default log settings */
  LOG_DEFAULT: process.env.LOG_DEFAULT === 'true',
  LOG_DIRECTORY: process.env.LOG_DIRECTORY ?? 'log',
  LOG_FILE_DEFAULT_NAME: process.env.LOG_FILE_DEFAULT_NAME ?? 'server.log',
  LOG_PRETTY: process.env.LOG_PRETTY === 'true',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',

  /** HTTPS enable flag */
  HTTPS: process.env.HTTPS === 'true',

  /** Path to key/certificate files */
  KEYS_PATH: process.env.KEYS_PATH ?? './keys',

  /** Tempo tracing endpoint */
  TEMPO_URI: process.env.TEMPO_URI ?? 'http://localhost:4318/v1/traces',

  /** Port on which the Node/NestJS server runs */
  PORT: Number(process.env.PORT ?? 4000),
  SUPERGRAPH_RETRY_INITIAL_MS: positiveTimerMs(
    'SUPERGRAPH_RETRY_INITIAL_MS',
    1_000,
  ),
  SUPERGRAPH_RETRY_MAX_MS: positiveTimerMs('SUPERGRAPH_RETRY_MAX_MS', 10_000),
  COOKIE_SECRET: secret('COOKIE_SECRET', 'omnixys-development-secret'),

  /** Keycloak / OAuth client configuration */
  KC_CLIENT_SECRET: process.env.KC_CLIENT_SECRET ?? '',
  KC_URL: process.env.KC_URL ?? 'http://localhost:18080/auth',
  KC_REALM: process.env.KC_REALM ?? 'camunda-platform',
  KC_CLIENT_ID: process.env.KC_CLIENT_ID ?? 'camunda-identity',
  KC_ADMIN_USERNAME: process.env.KC_ADMIN_USERNAME ?? 'admin',
  KC_ADMIN_PASSWORD: process.env.KC_ADMIN_PASSWORD ?? 'admin',

  /** Kafka configuration */
  KAFKA_BROKER: process.env.KAFKA_BROKER ?? 'localhost:9092',
  SERVICE: process.env.SERVICE ?? 'SERVICE',

  /** Health endpoints */
  KEYCLOAK_HEALTH_URL: process.env.KEYCLOAK_HEALTH_URL ?? '',
  TEMPO_HEALTH_URL: process.env.TEMPO_HEALTH_URL ?? '',
  PROMETHEUS_HEALTH_URL: process.env.PROMETHEUS_HEALTH_URL ?? '',

  PC_JWE_KEY: process.env.PC_JWE_KEY ?? '',
  PC_TTL_SEC: Number(process.env.PC_TTL_SEC ?? 60 * 60 * 24 * 30),
  INTERNAL_GATEWAY_TOKEN: secret(
    'INTERNAL_GATEWAY_TOKEN',
    'dev-internal-gateway-token',
  ),
  VALKEY_URL: process.env.VALKEY_URL ?? 'valkey://localhost:6380',
  VALKEY_PASSWORD: secret('VALKEY_PASSWORD', ''),

  AUTHENTICATION_URI:
    process.env.AUTHENTICATION_URI ?? 'http://localhost:7501/graphql',
  EVENT_URI: process.env.EVENT_URI ?? 'http://localhost:7406/graphql',
  INVITATION_URI: process.env.INVITATION_URI ?? 'http://localhost:7407/graphql',
  TICKET_URI: process.env.TICKET_URI ?? 'http://localhost:7408/graphql',
  NOTIFICATION_URI:
    process.env.NOTIFICATION_URI ?? 'http://localhost:3005/graphql',
  USER_URI: process.env.USER_URI ?? 'http://localhost:7402/graphql',
  SEAT_URI: process.env.SEAT_URI ?? 'http://localhost:7409/graphql',
  ADDRESS_URI: process.env.ADDRESS_URI ?? 'http://localhost:7004/graphql',
  LOGSTREAM_URI: process.env.LOGSTREAM_URI ?? 'http://localhost:7401/graphql',
  CHAT_URI: process.env.CHAT_URI ?? 'http://localhost:8001/graphql',
  COMMUNICATION_GATEWAY_URI:
    process.env.COMMUNICATION_GATEWAY_URI ?? 'http://localhost:8002/graphql',
  CHAT_SERVICE_API_KEY: secret(
    'CHAT_SERVICE_API_KEY',
    'omnixys-chat-local-key',
  ),
  COMMUNICATION_GATEWAY_API_KEY: secret(
    'COMMUNICATION_GATEWAY_API_KEY',
    'omnixys-gateway-local-key',
  ),
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
