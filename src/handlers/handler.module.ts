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

import { AdminModule } from '../admin/admin.module.js';
import { SubscriptionServerModule } from '../subscriptions/subscription.module.js';
import { UserSignedUpKafkaHandler } from './notification.handler.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [AdminModule, SubscriptionServerModule],
  providers: [
    UserSignedUpKafkaHandler,
  ],
  exports: [
    UserSignedUpKafkaHandler,
  ],
})
export class HandlerModule {}
