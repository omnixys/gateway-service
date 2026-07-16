import { env } from '../config/env.js';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class ChatAccessService {
  async assertParticipant(conversationId: string, userId: string): Promise<void> {
    const baseUrl = new URL(env.CHAT_URI).origin;
    const response = await fetch(
      `${baseUrl}/api/v1/internal/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}`,
      { headers: { 'x-api-key': env.CHAT_SERVICE_API_KEY } },
    );

    if (response.ok) {
      return;
    }
    if (response.status === 403) {
      throw new ForbiddenException('Conversation access denied');
    }
    if (response.status === 404) {
      throw new NotFoundException('Conversation not found');
    }
    throw new ServiceUnavailableException('Chat access check failed');
  }
}
