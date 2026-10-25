import { INestApplicationContext, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';

const logger = new Logger('AdminReset');

/**
 * Break-glass recovery for a SUPER_ADMIN who forgot their password, for hosts
 * without a shell. Store admins are reset from the Usuarios page instead.
 *
 * With ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD set, the app gives that
 * SUPER_ADMIN the password as a temporary one (must be changed at login),
 * unlocks and re-enables the account and closes its sessions.
 *
 * It applies once per value: the reset is recorded in the audit log with a
 * fingerprint, so later restarts with the same variables do nothing and the
 * new password the admin chose is not overwritten. Remove the variables after use.
 */
export async function applyAdminReset(
  app: INestApplicationContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<'reset' | 'already-applied' | 'not-found' | 'not-configured'> {
  const email = env.ADMIN_RESET_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_RESET_PASSWORD;
  if (!email && !password) return 'not-configured';
  if (
    !email ||
    !password ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    password.length < 12
  ) {
    throw new Error(
      'ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD (12+ characters) must both be set and valid',
    );
  }

  const fingerprint = createHash('sha256')
    .update(`admin-reset:${email}:${password}`)
    .digest('hex');
  const db = app.get(DataSource);
  const hash = await app.get(PasswordService).hash(password);

  const result = await db.transaction(async (m) => {
    await m.query(`SELECT pg_advisory_xact_lock(hashtext('admin-reset'))`);
    const done = await m.query(
      `SELECT 1 FROM audit_events
        WHERE action = 'USER_PASSWORD_RESET' AND metadata->>'resetFingerprint' = $1`,
      [fingerprint],
    );
    if (done.length) return 'already-applied' as const;

    const [user] = await m.query(
      `SELECT id FROM users WHERE lower(email) = $1 AND role = 'SUPER_ADMIN'`,
      [email],
    );
    if (!user) return 'not-found' as const;

    await m.query(
      `UPDATE users SET "passwordHash" = $1, "mustChangePassword" = true, "isActive" = true,
              "failedLoginCount" = 0, "lockedUntil" = NULL, "passwordChangedAt" = now(),
              "updatedAt" = now()
        WHERE id = $2`,
      [hash, user.id],
    );
    await m.query(
      `UPDATE sessions SET "revokedAt" = now() WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [user.id],
    );
    await app.get(AuditService).record(
      {
        action: 'USER_PASSWORD_RESET',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          via: 'ADMIN_RESET_* variables',
          email,
          resetFingerprint: fingerprint,
        },
      },
      m,
    );
    return 'reset' as const;
  });

  if (result === 'reset') {
    logger.warn(
      `Password of SUPER_ADMIN ${email} reset to the temporary one in ADMIN_RESET_PASSWORD. Remove the ADMIN_RESET_* variables now.`,
    );
  } else if (result === 'already-applied') {
    logger.warn(
      'ADMIN_RESET_* already applied earlier: nothing changed. Remove those variables.',
    );
  } else {
    logger.warn(
      `ADMIN_RESET_EMAIL ${email} is not a SUPER_ADMIN: nothing changed.`,
    );
  }
  return result;
}
