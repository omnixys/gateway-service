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

import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { KafkaLifecycleService } from '@omnixys/kafka';
import { OmnixysLogger } from '@omnixys/logger';

@Injectable()
export class KafkaIndicator {
  private readonly logger;

  constructor(
    private readonly kafka: KafkaLifecycleService,
    logger: OmnixysLogger,
  ) {
    this.logger = logger.log(this.constructor.name);
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    const health = this.kafka.health();
    if (health.healthy) {
      return {
        kafka: {
          status: 'up',
          producer: health.producer.status,
          consumer: health.consumer.status,
        },
      };
    }

    this.logger.error('Kafka health check failed', { health });
    return {
      kafka: {
        status: 'down',
        producer: health.producer.status,
        consumer: health.consumer.status,
      },
    };
  }
}
