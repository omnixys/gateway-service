/**
 * @license GPL-3.0-or-later
 * Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
 */

import { env } from '../config/env.js';
import { Injectable } from '@nestjs/common';
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';

export interface PlatformTokenClaims extends JWTPayload {
  ver?: string;
  tenant_id?: string;
  tenant_role?: string;
}

/**
 * JWKS des authentication-service (`GET /auth/oidc/certs`). Das Remote-Set
 * wird von jose gecacht; neue Keys werden bei jedem Verify nachgeladen.
 */
const PLATFORM_JWKS = createRemoteJWKSet(new URL(env.PLATFORM_JWKS_URI));

/**
 * Verifiziert Plattform-Tokens (RS256) gegen den Issuer des
 * authentication-service. Der Issuer ist `PLATFORM_ISSUER` (Standard
 * `http://localhost:7501`).
 */
@Injectable()
export class PlatformTokenVerifier {
  async verify(token: string): Promise<PlatformTokenClaims> {
    const { payload } = await jwtVerify<PlatformTokenClaims>(
      token,
      PLATFORM_JWKS,
      {
        issuer: env.PLATFORM_ISSUER,
        algorithms: ['RS256'],
      },
    );
    return payload;
  }
}
