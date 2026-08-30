import { MailTokenService, type MailTokenResponse } from './mail-token.service.js';
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { HeaderAuthGuard } from '@omnixys/security-ts';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Controller('v1/mail')
export class MailTokenController {
  constructor(private readonly mailTokens: MailTokenService) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HeaderAuthGuard)
  async issue(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-omnimail-service-token') serviceToken: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MailTokenResponse> {
    reply.header('cache-control', 'no-store').header('pragma', 'no-cache');
    if (request.body !== undefined && request.body !== null) {
      throw new BadRequestException({
        code: 'MAIL_TOKEN_BODY_NOT_ALLOWED',
        message: 'Request body must be empty',
      });
    }
    if (!authorization || !request.user?.id) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Bearer token is required',
      });
    }
    return this.mailTokens.issue({
      authorization,
      serviceToken,
      subject: request.user.id,
      ip: request.ip,
    });
  }
}
