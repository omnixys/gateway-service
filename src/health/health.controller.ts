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

import { env } from '../config/env.js';
import { KafkaIndicator } from './kafka.indicator.js';
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheck,
  HealthCheckResult,
  type HealthIndicatorFunction,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { ValkeyService } from '@omnixys/cache';

const { KEYCLOAK_HEALTH_URL, TEMPO_HEALTH_URL, PROMETHEUS_HEALTH_URL } = env;
@Controller('health')
export class HealthController {
  readonly #health: HealthCheckService;
  readonly #http: HttpHealthIndicator;
  readonly #kafka: KafkaIndicator;
  readonly #cache: ValkeyService;

  constructor(
    health: HealthCheckService,
    http: HttpHealthIndicator,
    kafka: KafkaIndicator,
    cache: ValkeyService,
  ) {
    this.#health = health;
    this.#http = http;
    this.#kafka = kafka;
    this.#cache = cache;
  }

  @Get('liveness')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.#health.check([() => Promise.resolve({ app: { status: 'up' } })]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    const checks: HealthIndicatorFunction[] = [
      () => Promise.resolve({ app: { status: 'up' } }),
      () => this.#kafka.isHealthy(),
      () => this.cacheHealth(),
    ];
    if (KEYCLOAK_HEALTH_URL) {
      checks.push(() => this.#http.pingCheck('keycloak', KEYCLOAK_HEALTH_URL));
    }
    if (TEMPO_HEALTH_URL) {
      checks.push(() => this.#http.pingCheck('tempo', TEMPO_HEALTH_URL));
    }
    if (PROMETHEUS_HEALTH_URL) {
      checks.push(() => this.#http.pingCheck('prometheus', PROMETHEUS_HEALTH_URL));
    }
    return this.#health.check(checks);
  }

  private async cacheHealth(): Promise<HealthIndicatorResult> {
    const health = await this.#cache.health();
    return {
      cache: {
        status: health.healthy ? 'up' : 'down',
        healthy: health.healthy,
        latencyMs: health.latencyMs,
        connectionStatus: health.status,
        error: health.error,
      },
    };
  }
}
