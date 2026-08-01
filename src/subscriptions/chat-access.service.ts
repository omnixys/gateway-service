import { env } from '../config/env.js';
import { Injectable } from '@nestjs/common';
import { ErrorCode, FrameworkException } from '@omnixys/contracts-ts';

@Injectable()
export class ChatAccessService {
  async assertParticipant(conversationId: string, userId: string): Promise<void> {
    const baseUrl = new URL(env.CHAT_URI).origin;
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/api/v1/internal/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}`,
        { headers: { 'x-api-key': env.CHAT_SERVICE_API_KEY } },
      );
    } catch (cause) {
      throw new FrameworkException(ErrorCode.DEPENDENCY_UNAVAILABLE, {
        cause,
        diagnostics: {
          dependency: 'chat',
          operation: 'assertParticipant',
          host: baseUrl,
        },
      });
    }

    if (response.ok) {
      return;
    }
    if (response.status === 403) {
      throw new FrameworkException(ErrorCode.CONVERSATION_ACCESS_DENIED, {
        metadata: { conversationId },
      });
    }
    if (response.status === 404) {
      throw new FrameworkException(ErrorCode.CONVERSATION_NOT_FOUND, {
        metadata: { conversationId },
      });
    }
    throw new FrameworkException(ErrorCode.DEPENDENCY_UNAVAILABLE, {
      diagnostics: {
        dependency: 'chat',
        operation: 'assertParticipant',
        upstreamStatus: response.status,
        host: baseUrl,
      },
    });
  }
}
