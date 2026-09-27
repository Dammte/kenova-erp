import type { Request } from 'express';
import { UserRole } from '../users/entities/user.entity';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}
