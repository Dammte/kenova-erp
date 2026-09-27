import type { Request } from 'express';
import { ClientInfo } from './auth.service';

export function clientInfo(req: Request): ClientInfo {
  const ua = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua : null };
}
