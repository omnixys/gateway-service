/**
 * @license GPL-3.0-or-later
 * Copyright (C) 2025 Caleb Gyamfi - Omnixys Technologies
 */

import { env } from '../config/env.js';
import { Metadata } from '@grpc/grpc-js';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import type {
  ValidateMembershipRequest,
  ValidateMembershipResponse,
} from '@omnixys/grpc-ts/types';
import { Observable, firstValueFrom } from 'rxjs';

type GrpcStubMethod<Req, Res> = (
  request: Req,
  metadata: Metadata,
) => Observable<Res>;

export interface TenantServiceStub {
  validateMembership: GrpcStubMethod<
    ValidateMembershipRequest,
    ValidateMembershipResponse
  >;
}

/**
 * gRPC-Stub für den TenantService (tenant-service), inklusive per-caller
 * Bearer-Authentifizierung über die grpc-Metadata (GrpcCallerGuard auf der
 * Server-Seite erwartet `authorization: Bearer <token>`).
 */
@Injectable()
export class TenantGrpcService implements OnModuleInit {
  private service!: TenantServiceStub;

  constructor(@Inject('GRPC_CLIENT') private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.service = this.client.getService<TenantServiceStub>('TenantService');
  }

  async validateMembership(
    request: ValidateMembershipRequest,
  ): Promise<ValidateMembershipResponse> {
    return firstValueFrom(
      this.service.validateMembership(request, this.metadata()),
    );
  }

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set('authorization', `Bearer ${env.TENANT_GRPC_GATEWAY_TOKEN}`);
    return metadata;
  }
}
