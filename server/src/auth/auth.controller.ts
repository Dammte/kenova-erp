import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  cookieSecure,
  SESSION_ABSOLUTE_MS,
  sessionCookieName,
} from './auth.constants';
import type { AuthenticatedRequest, AuthUser } from './auth.types';
import { clientInfo } from './client-info';
import { AllowPendingPassword } from './decorators/allow-pending-password.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string) {
    res.cookie(sessionCookieName(), token, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_ABSOLUTE_MS,
    });
  }

  private clearCookie(res: Response) {
    res.clearCookie(sessionCookieName(), {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: 'lax',
      path: '/',
    });
  }

  @Public()
  // 10 attempts per minute per IP, on top of the per-account lockout.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.auth.login(
      dto.email,
      dto.password,
      clientInfo(req),
    );
    this.setCookie(res, token);
    return { user };
  }

  @AllowPendingPassword()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.sessionId!, req.user!.id, clientInfo(req));
    this.clearCookie(res);
  }

  @AllowPendingPassword()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @AllowPendingPassword()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.auth.changePassword(
      req.user!.id,
      req.sessionId!,
      dto.currentPassword,
      dto.newPassword,
      clientInfo(req),
    );
  }
}
