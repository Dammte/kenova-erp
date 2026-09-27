import { MigrationInterface, QueryRunner } from 'typeorm';
import { SecretCipher } from '../common/crypto/secret-cipher';
import { uuidFunction } from '../common/db/uuid-function';

/**
 * Security foundation (audit findings SEC-001/002/003, PRIV-001, DATA-001).
 *
 * Written against the schema the entities on `master` produce, and defensive
 * (IF EXISTS / IF NOT EXISTS, constraint lookups by definition instead of by
 * name) because production was built with `synchronize` and never had a
 * migrations table, so its exact shape is not guaranteed.
 *
 * Runs in a single transaction: either everything applies or nothing does.
 *
 * Requires DEVICE_SECRET_KEY when any device has a PIN or pattern stored.
 */
export class SecurityFoundation1759000000000 implements MigrationInterface {
  name = 'SecurityFoundation1759000000000';

  public async up(q: QueryRunner): Promise<void> {
    // ── users: plaintext passwords out, Argon2id hashes and lockout in ─────────
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" text`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failedLoginCount" integer NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP WITH TIME ZONE`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP WITH TIME ZONE`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP WITH TIME ZONE`,
    );

    // Every existing account was creatable anonymously and has its password in
    // clear text: none of them can be trusted. They are kept (history rows point
    // at them) but disabled; new accounts are created with the bootstrap script.
    await q.query(
      `UPDATE "users" SET "isActive" = false, "passwordHash" = NULL, "mustChangePassword" = true`,
    );
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "password"`);

    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await q.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE varchar(20)
         USING (CASE "role"::text WHEN 'ADMIN' THEN 'SUPER_ADMIN'
                                  WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'
                                  ELSE 'STORE_ADMIN' END)`,
    );
    await q.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STORE_ADMIN'`,
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL`);
    await q.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_role"`,
    );
    await q.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_role" CHECK ("role" IN ('SUPER_ADMIN', 'STORE_ADMIN'))`,
    );
    await q.query(`DROP TYPE IF EXISTS "users_role_enum"`);

    const uuid = await uuidFunction(q);

    // ── sessions ──────────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS "sessions" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "tokenHash" char(64) NOT NULL,
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "ip" varchar(64),
        "userAgent" varchar(255),
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sessions_tokenHash" ON "sessions" ("tokenHash")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sessions_userId" ON "sessions" ("userId")`,
    );

    // ── audit_events (append-only) ─────────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS "audit_events" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actorUserId" uuid,
        "action" varchar(64) NOT NULL,
        "entityType" varchar(40),
        "entityId" varchar(64),
        "ip" varchar(64),
        "metadata" jsonb,
        CONSTRAINT "PK_audit_events" PRIMARY KEY ("id")
      )`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_events_createdAt" ON "audit_events" ("createdAt")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_events_actor" ON "audit_events" ("actorUserId")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_events_entity" ON "audit_events" ("entityType", "entityId")`,
    );

    // ── devices: unlock PIN / pattern encrypted, plaintext columns dropped ────
    await q.query(
      `ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "unlockSecretCiphertext" text`,
    );
    await q.query(
      `ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "unlockSecretType" varchar(10)`,
    );
    await q.query(
      `ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "unlockSecretSetAt" TIMESTAMP WITH TIME ZONE`,
    );
    await q.query(
      `ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "CHK_devices_unlockSecretType"`,
    );
    await q.query(
      `ALTER TABLE "devices" ADD CONSTRAINT "CHK_devices_unlockSecretType"
         CHECK ("unlockSecretType" IS NULL OR "unlockSecretType" IN ('CODE', 'PATTERN'))`,
    );

    const hasPlain = await q.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'devices' AND column_name IN ('code', 'pattern')`,
    );
    if (hasPlain[0].n === 2) {
      const rows: {
        id: string;
        code: string | null;
        pattern: string | null;
      }[] = await q.query(
        `SELECT id, code, pattern FROM "devices"
          WHERE NULLIF(btrim(coalesce(code, '')), '') IS NOT NULL
             OR NULLIF(btrim(coalesce(pattern, '')), '') IS NOT NULL`,
      );
      if (rows.length > 0) {
        const cipher = SecretCipher.fromEnv();
        for (const row of rows) {
          const code = (row.code ?? '').trim();
          const pattern = (row.pattern ?? '').trim();
          const [type, value] = code ? ['CODE', code] : ['PATTERN', pattern];
          await q.query(
            `UPDATE "devices"
                SET "unlockSecretCiphertext" = $1, "unlockSecretType" = $2, "unlockSecretSetAt" = now()
              WHERE id = $3`,
            [cipher.encrypt(value, row.id), type, row.id],
          );
        }
      }
    }
    await q.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "code"`);
    await q.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "pattern"`);

    // ── client: '' is not a DNI (it made the 2nd client without DNI fail) ─────
    await q.query(`UPDATE "client" SET "dni" = NULL WHERE btrim("dni") = ''`);
    await q.query(`ALTER TABLE "client" ALTER COLUMN "dni" DROP DEFAULT`);
    await q.query(
      `UPDATE "client" SET "email" = NULL WHERE btrim("email") = ''`,
    );
    await q.query(
      `ALTER TABLE "client" ALTER COLUMN "phoneNumber" DROP DEFAULT`,
    );

    // ── service_orders: soft delete, and deleting a client never cascades ─────
    await q.query(
      `ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP`,
    );
    const fks: { conname: string }[] = await q.query(`
      SELECT c.conname FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f'
         AND c.conrelid = 'service_orders'::regclass
         AND c.confrelid = 'client'::regclass
         AND a.attname = 'clientId'`);
    for (const fk of fks) {
      await q.query(
        `ALTER TABLE "service_orders" DROP CONSTRAINT "${fk.conname.replace(/"/g, '""')}"`,
      );
    }
    const fkName = q.connection.namingStrategy.foreignKeyName(
      'service_orders',
      ['clientId'],
      'client',
      ['id'],
    );
    await q.query(
      `ALTER TABLE "service_orders" ADD CONSTRAINT "${fkName}"
         FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // ── sanity checks for new writes (NOT VALID: existing rows are not touched) ─
    await q.query(
      `ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "CHK_inventory_stock_nonnegative"`,
    );
    await q.query(
      `ALTER TABLE "inventory" ADD CONSTRAINT "CHK_inventory_stock_nonnegative"
         CHECK ("stock" IS NULL OR "stock" >= 0) NOT VALID`,
    );
    await q.query(
      `ALTER TABLE "service_orders" DROP CONSTRAINT IF EXISTS "CHK_service_orders_amounts_nonnegative"`,
    );
    await q.query(
      `ALTER TABLE "service_orders" ADD CONSTRAINT "CHK_service_orders_amounts_nonnegative"
         CHECK (coalesce("totalPrice", 0) >= 0 AND coalesce("amountPaid", 0) >= 0) NOT VALID`,
    );
  }

  /**
   * Rollback restores the previous shape. Unlock secrets are decrypted back into
   * the old columns (needs DEVICE_SECRET_KEY). User passwords cannot come back:
   * restored accounts have no password and stay disabled.
   */
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "service_orders" DROP CONSTRAINT IF EXISTS "CHK_service_orders_amounts_nonnegative"`,
    );
    await q.query(
      `ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "CHK_inventory_stock_nonnegative"`,
    );

    const fkName = q.connection.namingStrategy.foreignKeyName(
      'service_orders',
      ['clientId'],
      'client',
      ['id'],
    );
    await q.query(
      `ALTER TABLE "service_orders" DROP CONSTRAINT IF EXISTS "${fkName}"`,
    );
    await q.query(
      `ALTER TABLE "service_orders" ADD CONSTRAINT "${fkName}"
         FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "service_orders" DROP COLUMN IF EXISTS "deletedAt"`,
    );
    await q.query(`ALTER TABLE "client" ALTER COLUMN "dni" SET DEFAULT ''`);
    await q.query(
      `ALTER TABLE "client" ALTER COLUMN "phoneNumber" SET DEFAULT ''`,
    );

    await q.query(
      `ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "code" varchar(50)`,
    );
    await q.query(
      `ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "pattern" varchar(50)`,
    );
    const rows: { id: string; c: string; t: string }[] = await q.query(
      `SELECT id, "unlockSecretCiphertext" AS c, "unlockSecretType" AS t
         FROM "devices" WHERE "unlockSecretCiphertext" IS NOT NULL`,
    );
    if (rows.length > 0) {
      const cipher = SecretCipher.fromEnv();
      for (const r of rows) {
        const value = cipher.decrypt(r.c, r.id);
        await q.query(
          `UPDATE "devices" SET ${r.t === 'PATTERN' ? '"pattern"' : '"code"'} = $1 WHERE id = $2`,
          [value, r.id],
        );
      }
    }
    await q.query(
      `ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "CHK_devices_unlockSecretType"`,
    );
    await q.query(
      `ALTER TABLE "devices" DROP COLUMN IF EXISTS "unlockSecretCiphertext"`,
    );
    await q.query(
      `ALTER TABLE "devices" DROP COLUMN IF EXISTS "unlockSecretType"`,
    );
    await q.query(
      `ALTER TABLE "devices" DROP COLUMN IF EXISTS "unlockSecretSetAt"`,
    );

    await q.query(`DROP TABLE IF EXISTS "audit_events"`);
    await q.query(`DROP TABLE IF EXISTS "sessions"`);

    await q.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_role"`,
    );
    await q.query(`CREATE TYPE "users_role_enum" AS ENUM ('ADMIN', 'MANAGER')`);
    await q.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await q.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum"
         USING (CASE "role" WHEN 'SUPER_ADMIN' THEN 'ADMIN' ELSE 'MANAGER' END)::"users_role_enum"`,
    );
    await q.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MANAGER'`,
    );
    await q.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password" varchar NOT NULL DEFAULT ''`,
    );
    await q.query(`ALTER TABLE "users" ALTER COLUMN "password" DROP DEFAULT`);
    for (const col of [
      'passwordHash',
      'isActive',
      'mustChangePassword',
      'failedLoginCount',
      'lockedUntil',
      'lastLoginAt',
      'passwordChangedAt',
    ]) {
      await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "${col}"`);
    }
  }
}
