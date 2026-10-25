import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientInfo } from './client-info';
import { Public } from './decorators/public.decorator';
import {
  ConfirmPasswordResetDto,
  RequestPasswordResetDto,
} from './dto/password-reset.dto';
import { PasswordResetService } from './password-reset.service';

@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  /** Lets the login page show "¿Olvidaste tu contraseña?" only when email works. */
  @Public()
  @Get('available')
  available() {
    return { available: this.resets.available };
  }

  @Public()
  // Per IP; each account is also limited to a few emails per hour.
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('request')
  @HttpCode(202)
  async request(@Body() dto: RequestPasswordResetDto, @Req() req: Request) {
    await this.resets.request(dto.email, clientInfo(req));
    // Same answer whether or not the account exists.
    return {
      message:
        'Si el email corresponde a una cuenta activa, recibirás un enlace para restablecer la contraseña.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('confirm')
  @HttpCode(204)
  async confirm(@Body() dto: ConfirmPasswordResetDto, @Req() req: Request) {
    await this.resets.confirm(dto.token, dto.newPassword, clientInfo(req));
  }
}
