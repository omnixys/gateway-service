import { env } from '../config/env.js';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ValkeyRateLimitService } from '@omnixys/cache-ts';
import { ErrorCode, FrameworkException } from '@omnixys/contracts-ts';
import { createHash } from 'node:crypto';

const {
  INTERNAL_GATEWAY_TOKEN,
  INVITATION_URI,
  NOTIFICATION_URI,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW,
} = env;

@Injectable()
export class SupportAccessService {
  constructor(private readonly rateLimit: ValkeyRateLimitService) {}

  async assertEventViewer(eventId: string, userId: string): Promise<void> {
    await this.assertNotificationAccess('event', { eventId, userId });
  }

  async assertConversationViewer(conversationId: string, userId: string): Promise<void> {
    await this.assertNotificationAccess('conversation', { conversationId, userId });
  }

  async assertInvitation(invitationId: string): Promise<void> {
    const capabilityHash = createHash('sha256').update(invitationId).digest('hex');
    const allowed = await this.rateLimit.hit(
      `support:rsvp-subscription:${capabilityHash}`,
      Math.max(1, Math.min(RATE_LIMIT_REQUESTS, 30)),
      Math.max(1, Math.ceil(RATE_LIMIT_WINDOW / 1000)),
    );
    if (!allowed) {
      throw new HttpException(
        'Too many support subscription requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const url = new URL('/internal/rsvp-support/context', new URL(INVITATION_URI).origin);
    url.searchParams.set('invitationId', invitationId);
    await this.fetchAccess(url, 'invitation');
  }

  private async assertNotificationAccess(
    scope: 'event' | 'conversation',
    params: Record<string, string>,
  ): Promise<void> {
    const url = new URL(`/internal/support/access/${scope}`, new URL(NOTIFICATION_URI).origin);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    await this.fetchAccess(url, 'notification');
  }

  private async fetchAccess(url: URL, dependency: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'x-internal-token': INTERNAL_GATEWAY_TOKEN },
      });
    } catch (cause) {
      throw new FrameworkException(ErrorCode.DEPENDENCY_UNAVAILABLE, {
        cause,
        diagnostics: { dependency, operation: 'supportSubscriptionAccess' },
      });
    }
    if (response.ok) {
      return;
    }
    if (response.status === 403 || response.status === 404 || response.status === 422) {
      throw new FrameworkException(ErrorCode.CONVERSATION_ACCESS_DENIED);
    }
    throw new FrameworkException(ErrorCode.DEPENDENCY_UNAVAILABLE, {
      diagnostics: {
        dependency,
        operation: 'supportSubscriptionAccess',
        upstreamStatus: response.status,
      },
    });
  }
}
