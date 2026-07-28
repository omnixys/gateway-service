import { env } from '../config/env.js';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getLogger } from '@omnixys/logger';

@Injectable()
export class ChatAccessService {
  readonly #logger = getLogger(ChatAccessService.name);

  async assertParticipant(conversationId: string, userId: string): Promise<void> {
    const baseUrl = new URL(env.CHAT_URI).origin;
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/api/v1/internal/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}`,
        { headers: { 'x-api-key': env.CHAT_SERVICE_API_KEY } },
      );
    } catch {
      this.#logger.warn({ conversationId, userId, baseUrl }, 'chat_access_http_failed');
      throw new ServiceUnavailableException('Chat access check failed');
    }

    if (response.ok) {
      return;
    }
    if (response.status === 403) {
      this.#logger.warn({ conversationId, userId }, 'chat_access_denied');
      throw new ForbiddenException('Conversation access denied');
    }
    if (response.status === 404) {
      this.#logger.warn({ conversationId, userId }, 'chat_access_not_found');
      throw new NotFoundException('Conversation not found');
    }
    this.#logger.warn(
      { conversationId, userId, status: response.status },
      'chat_access_unexpected_status',
    );
    throw new ServiceUnavailableException('Chat access check failed');
  }
}
