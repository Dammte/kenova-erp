import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * CSRF defence in depth. The session cookie is SameSite=Lax, which already stops
 * cross-site POSTs from carrying it; on top of that, any state-changing request
 * that declares an Origin must come from one of the allowed frontends.
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly origins = new Set(allowedOrigins());

  use(req: Request, _res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (
      origin &&
      origin !== 'null' &&
      !this.origins.has(origin.replace(/\/$/, ''))
    ) {
      throw new ForbiddenException('Origen no permitido');
    }
    if (origin === 'null') throw new ForbiddenException('Origen no permitido');
    next();
  }
}
