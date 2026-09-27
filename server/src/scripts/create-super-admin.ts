/**
 * Creates (or re-enables with a new temporary password) a SUPER_ADMIN account.
 *
 *   npm run user:create-super-admin -- --email ana@kenova.es --username ana --name "Ana Pérez"
 *
 * Prints a random temporary password once. The user must change it at first login.
 * Run it against the database in DATABASE_URL / DB_* (never commit that value).
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { buildDatabaseOptions } from '../config/database.config';

dotenv.config({ quiet: true });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const username = arg('username')?.trim();
  const fullName = arg('name')?.trim();
  if (!email || !username || !fullName) {
    console.error(
      'Uso: --email <email> --username <usuario> --name "<Nombre completo>"',
    );
    process.exit(2);
  }
  if (
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    !/^[a-zA-Z0-9._-]{3,50}$/.test(username)
  ) {
    console.error('Email o usuario no válido');
    process.exit(2);
  }

  // 18 random bytes → 24 base64url characters.
  const temporaryPassword = randomBytes(18).toString('base64url');
  const hash = await argon2.hash(temporaryPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const ds = new DataSource({
    ...buildDatabaseOptions(),
    entities: [],
    migrations: [],
  });
  await ds.initialize();
  try {
    const existing: { id: string }[] = await ds.query(
      `SELECT id FROM users WHERE email = $1 OR username = $2`,
      [email, username],
    );
    if (existing.length > 1) {
      throw new Error('El email y el usuario pertenecen a cuentas distintas');
    }
    if (existing.length === 1) {
      await ds.query(
        `UPDATE users SET "fullName" = $1, role = 'SUPER_ADMIN', "passwordHash" = $2,
                "isActive" = true, "mustChangePassword" = true, "failedLoginCount" = 0,
                "lockedUntil" = NULL, "passwordChangedAt" = now(), "updatedAt" = now()
          WHERE id = $3`,
        [fullName, hash, existing[0].id],
      );
      await ds.query(
        `UPDATE sessions SET "revokedAt" = now() WHERE "userId" = $1 AND "revokedAt" IS NULL`,
        [existing[0].id],
      );
      console.log(`Cuenta existente reactivada como SUPER_ADMIN: ${email}`);
    } else {
      await ds.query(
        `INSERT INTO users (username, "fullName", email, role, "passwordHash", "isActive", "mustChangePassword", "passwordChangedAt")
         VALUES ($1, $2, $3, 'SUPER_ADMIN', $4, true, true, now())`,
        [username, fullName, email, hash],
      );
      console.log(`SUPER_ADMIN creado: ${email}`);
    }
    await ds.query(
      `INSERT INTO audit_events (action, "entityType", metadata) VALUES ('USER_CREATED', 'user', $1)`,
      [JSON.stringify({ via: 'create-super-admin script', email })],
    );
    console.log(
      `Contraseña temporal (se pedirá cambiarla al entrar): ${temporaryPassword}`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
