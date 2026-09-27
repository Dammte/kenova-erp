import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { sessionCookieName } from '../auth.constants';
import { AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_PENDING_PASSWORD_KEY } from '../decorators/allow-pending-password.decorator';

/**
 * Global guard: every route requires a valid session unless marked @Public().
 * Deny by default, so a new controller is protected without extra work.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.cookies?.[sessionCookieName()];
    const result = token ? await this.auth.validateSession(token) : null;
    if (!result) {
      throw new UnauthorizedException('Sesión no válida o caducada');
    }
    req.user = result.user;
    req.sessionId = result.sessionId;

    // Accounts with a temporary password can only change it (or log out).
    if (
      result.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(
        ALLOW_PENDING_PASSWORD_KEY,
        targets,
      )
    ) {
      throw new ForbiddenException(
        'Debes cambiar tu contraseña antes de continuar',
      );
    }
    return true;
  }
}
