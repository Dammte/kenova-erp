import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';
import {
  LOCKOUT_MS,
  MAX_FAILED_LOGINS,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_MS,
} from './auth.constants';
import { AuthUser } from './auth.types';
import { Session } from './entities/session.entity';
import { PasswordService } from './password.service';

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';

export interface ClientInfo {
  ip?: string | null;
  userAgent?: string | null;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  private findUserWithSecrets(where: Partial<User>) {
    return this.users
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.failedLoginCount', 'u.lockedUntil'])
      .where(where)
      .getOne();
  }

  /**
   * Checks the credentials and opens a session. Every failure returns the same
   * message so the response does not reveal whether the email exists.
   */
  async login(
    email: string,
    password: string,
    client: ClientInfo,
  ): Promise<{ token: string; user: AuthUser; expiresAt: Date }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.findUserWithSecrets({ email: normalized });
    const now = new Date();

    if (user?.lockedUntil && user.lockedUntil > now) {
      // Still spend the hashing time so a locked account is not distinguishable.
      await this.passwords.verify(null, password);
      await this.audit.record({
        action: 'AUTH_LOGIN_LOCKED',
        actorUserId: user.id,
        entityType: 'user',
        entityId: user.id,
        ip: client.ip,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const ok = await this.passwords.verify(user?.passwordHash, password);

    if (!user || !ok || !user.isActive || !user.passwordHash) {
      if (user) {
        const failed = (user.failedLoginCount ?? 0) + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        await this.users.update(user.id, {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(now.getTime() + LOCKOUT_MS) : null,
        });
      }
      await this.audit.record({
        action: 'AUTH_LOGIN_FAILED',
        actorUserId: user?.id ?? null,
        entityType: 'user',
        entityId: user?.id,
        ip: client.ip,
        metadata: user
          ? { reason: !user.isActive ? 'inactive' : 'password' }
          : { reason: 'unknown_email' },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const updates: Partial<User> = {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: now,
    };
    if (this.passwords.needsRehash(user.passwordHash)) {
      updates.passwordHash = await this.passwords.hash(password);
    }
    await this.users.update(user.id, updates);

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
    await this.sessions.insert({
      tokenHash: hashToken(token),
      userId: user.id,
      lastSeenAt: now,
      expiresAt,
      ip: client.ip?.slice(0, 64) ?? null,
      userAgent: client.userAgent?.slice(0, 255) ?? null,
    });
    await this.audit.record({
      action: 'AUTH_LOGIN_SUCCEEDED',
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      ip: client.ip,
    });
    return { token, user: toAuthUser(user), expiresAt };
  }

  /** Resolves a session token to its user, or null if it is not valid any more. */
  async validateSession(
    token: string,
  ): Promise<{ user: AuthUser; sessionId: string } | null> {
    if (!token || token.length > 128) return null;
    const session = await this.sessions.findOne({
      where: { tokenHash: hashToken(token), revokedAt: IsNull() },
      relations: ['user'],
    });
    if (!session || !session.user) return null;

    const now = Date.now();
    if (
      session.expiresAt.getTime() <= now ||
      session.lastSeenAt.getTime() + SESSION_IDLE_MS <= now ||
      !session.user.isActive
    ) {
      return null;
    }
    if (now - session.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
      await this.sessions.update(session.id, { lastSeenAt: new Date(now) });
    }
    return { user: toAuthUser(session.user), sessionId: session.id };
  }

  async logout(
    sessionId: string,
    userId: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.sessions.update(
      { id: sessionId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    await this.audit.record({
      action: 'AUTH_LOGOUT',
      actorUserId: userId,
      entityType: 'user',
      entityId: userId,
      ip: client.ip,
    });
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<void> {
    const user = await this.findUserWithSecrets({ id: userId });
    if (
      !user ||
      !(await this.passwords.verify(user.passwordHash, currentPassword))
    ) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual',
      );
    }
    await this.users.update(user.id, {
      passwordHash: await this.passwords.hash(newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    });
    // Sign out every other device.
    await this.sessions.update(
      { userId: user.id, revokedAt: IsNull(), id: Not(currentSessionId) },
      { revokedAt: new Date() },
    );
    await this.audit.record({
      action: 'AUTH_PASSWORD_CHANGED',
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      ip: client.ip,
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.sessions.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
