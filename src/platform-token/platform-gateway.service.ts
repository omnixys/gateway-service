/**
 * @license GPL-3.0-or-later
 * Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
 */

import { TenantValidationService } from '../tenant/tenant-validation.service.js';
import { PlatformTokenVerifier } from './platform-token.verifier.js';
import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
let instance: PlatformGatewayService | undefined;

export function setPlatformGateway(service: PlatformGatewayService): void {
  instance = service;
}

export function getPlatformGateway(): PlatformGatewayService | undefined {
  return instance;
}

/**
 * Edge-Trust-Boundary des Gateways:
 *  1. Plattform-Token gegen die JWKS des authentication-service verifizieren
 *     (Plattform-Issuer statt Keycloak).
 *  2. `x-tenant-id` wird aus dem verifizierten `tenant_id`-Claim abgeleitet
 *     (client-seitige Header werden ignoriert → keine Cross-Tenant-Weiterleitung).
 *  3. Membership im Ziel-Tenant via gRPC (tenant-service) validieren, Ergebnis
 *     kurz in Valkey cachen. Fail-closed: Fehler/Nicht-aktive Membership → Ablehnung.
 */
@Injectable()
export class PlatformGatewayService {
  constructor(
    private readonly verifier: PlatformTokenVerifier,
    private readonly validation: TenantValidationService,
  ) {}

  /**
   * Verifiziert das Plattform-Token und liefert den autoritativen Tenant.
   * Ohne Token → `undefined` (Subgraph entscheidet); mit Token aber ohne
   * `tenant_id`/`sub` oder ungültig → Fehler.
   */
  async resolveTenant(token: string | undefined): Promise<string | undefined> {
    if (!token) {
      return undefined;
    }

    let claims;
    try {
      claims = await this.verifier.verify(token);
    } catch {
      throw new GraphQLError('Invalid platform token', {
        extensions: {
          code: 'INVALID_PLATFORM_TOKEN',
          http: { status: 401 },
        },
      });
    }

    const tenantId = claims.tenant_id;
    const userId = claims.sub;
    if (!tenantId || !userId) {
      throw new GraphQLError('Platform token missing tenant or subject', {
        extensions: {
          code: 'PLATFORM_TOKEN_CONTEXT_MISSING',
          http: { status: 401 },
        },
      });
    }

    await this.validation.validate(tenantId, userId);
    return tenantId;
  }
}
