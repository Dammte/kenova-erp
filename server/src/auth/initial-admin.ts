import { INestApplicationContext, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';

const logger = new Logger('InitialAdmin');

/**
 * Creates the first SUPER_ADMIN from INITIAL_ADMIN_* variables, for hosts
 * without a shell (e.g. Render's free plan) where the create-super-admin
 * script cannot be run.
 *
 * Only acts when no active SUPER_ADMIN exists, so it can never take over or
 * reset an account on a running system. The password is temporary: the user
 * must change it at first login. Remove the variables afterwards.
 *
 * Returns what it did, for tests and logs.
 */
export async function ensureInitialAdmin(
  app: INestApplicationContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<'created' | 'skipped' | 'not-configured'> {
  const email = env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const username = env.INITIAL_ADMIN_USERNAME?.trim();
  const fullName = env.INITIAL_ADMIN_NAME?.trim();
  const password = env.INITIAL_ADMIN_PASSWORD;
  if (!email && !username && !fullName && !password) return 'not-configured';

  if (
    !email ||
    !username ||
    !fullName ||
    !password ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    !/^[a-zA-Z0-9._-]{3,50}$/.test(username) ||
    password.length < 12
  ) {
    throw new Error(
      'INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_NAME and INITIAL_ADMIN_PASSWORD (12+ characters) must all be set and valid',
    );
  }

  const db = app.get(DataSource);
  const hash = await app.get(PasswordService).hash(password);
  const result = await db.transaction(async (m) => {
    // Serialises concurrent instances starting at the same time.
    await m.query(`SELECT pg_advisory_xact_lock(hashtext('initial-admin'))`);
    const [{ n }] = await m.query(
      `SELECT count(*)::int AS n FROM users WHERE role = 'SUPER_ADMIN' AND "isActive"`,
    );
    if (n > 0) return 'skipped' as const;
    const taken = await m.query(
      `SELECT 1 FROM users WHERE email = $1 OR username = $2`,
      [email, username],
    );
    if (taken.length) {
      throw new Error(
        'INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_USERNAME belongs to an existing user; use the create-super-admin script instead',
      );
    }
    const [row] = await m.query(
      `INSERT INTO users (username, "fullName", email, role, "passwordHash", "isActive", "mustChangePassword", "passwordChangedAt")
       VALUES ($1, $2, $3, 'SUPER_ADMIN', $4, true, true, now()) RETURNING id`,
      [username, fullName, email, hash],
    );
    await app.get(AuditService).record(
      {
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: row.id,
        metadata: { via: 'INITIAL_ADMIN_* variables', email },
      },
      m,
    );
    return 'created' as const;
  });

  if (result === 'created') {
    logger.log(
      `First SUPER_ADMIN created: ${email} (must change the password at first login)`,
    );
  } else {
    logger.warn(
      'A SUPER_ADMIN already exists: INITIAL_ADMIN_* ignored. Remove those variables.',
    );
  }
  return result;
}
