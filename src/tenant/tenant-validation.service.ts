/**
 * @license GPL-3.0-or-later
 * Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
 */

import { env } from '../config/env.js';
import { TenantGrpcService } from './tenant-grpc.client.js';
import { Injectable } from '@nestjs/common';
import { ValkeyService } from '@omnixys/cache-ts';
import { GraphQLError } from 'graphql';

const cacheKey = (tenantId: string, userId: string): string =>
  `tenant:validated:${tenantId}:${userId}`;

/**
 * Validiert, dass ein User eine aktive Membership im Ziel-Tenant hat.
 * Ergebnis wird kurz in Valkey gecacht (`tenant:validated:{tenantId}:{userId}`).
 * Fail-closed: gRPC-Fehler oder nicht-aktive Membership → Ablehnung.
 */
@Injectable()
export class TenantValidationService {
  constructor(
    private readonly tenants: TenantGrpcService,
    private readonly cache: ValkeyService,
  ) {}

  async validate(tenantId: string, userId: string): Promise<void> {
    const key = cacheKey(tenantId, userId);
    if (await this.cache.exists(key)) {
      return;
    }

    let result;
    try {
      result = await this.tenants.validateMembership({ tenantId, userId });
    } catch {
      throw new GraphQLError('Tenant validation service unavailable', {
        extensions: {
          code: 'TENANT_SERVICE_UNAVAILABLE',
          http: { status: 503 },
        },
      });
    }

    if (!result.tenantExists || !result.tenantActive || !result.membershipActive) {
      throw new GraphQLError('Tenant access denied', {
        extensions: {
          code: 'TENANT_ACCESS_DENIED',
          http: { status: 403 },
          tenantId,
        },
      });
    }

    await this.cache.rawSet(key, '1', env.TENANT_VALIDATION_CACHE_TTL_SEC);
  }
}
