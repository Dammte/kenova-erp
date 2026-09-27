import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client as PgClient } from 'pg';
import request = require('supertest');
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/common/setup-app';
import { buildDatabaseOptions } from '../../src/config/database.config';

/**
 * Admin connection used only to CREATE/DROP throwaway databases.
 * Defaults to a local PostgreSQL; CI provides its own service container.
 */
const ADMIN_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/postgres';

if (/render\.com|onrender|amazonaws|neon\.tech|supabase/.test(ADMIN_URL)) {
  throw new Error(
    'E2E_DATABASE_URL must point at a local/CI database, never a hosted one',
  );
}

export const PASSWORD = 'Contraseña-de-prueba-123';
export const ORIGIN = 'http://localhost:3000';

export interface TestContext {
  app: INestApplication;
  db: DataSource;
  http: () => ReturnType<typeof request>;
  superAdmin: { id: string; email: string };
  storeAdmin: { id: string; email: string };
  login: (email: string, password?: string) => Promise<string>;
  close: () => Promise<void>;
}

async function admin<T>(fn: (c: PgClient) => Promise<T>): Promise<T> {
  const c = new PgClient({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

function dbUrl(name: string) {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * Builds the database the way production would get it: the schema of the old
 * code (fixture), optional legacy rows, then the real migrations.
 */
export async function createLegacyDatabase(seedSql?: string): Promise<string> {
  const name = `e2e_${randomBytes(6).toString('hex')}`;
  await admin((c) => c.query(`CREATE DATABASE ${name}`));
  const c = new PgClient({ connectionString: dbUrl(name) });
  await c.connect();
  try {
    await c.query(
      readFileSync(join(__dirname, '../fixtures/legacy-schema.sql'), 'utf8'),
    );
    if (seedSql) await c.query(seedSql);
  } finally {
    await c.end();
  }
  return name;
}

/** A brand-new, empty database: what a fresh deployment (e.g. Kenova) starts from. */
export async function createEmptyDatabase(): Promise<string> {
  const name = `e2e_${randomBytes(6).toString('hex')}`;
  await admin((c) => c.query(`CREATE DATABASE ${name}`));
  return name;
}

export function databaseUrl(name: string): string {
  return dbUrl(name);
}

export async function runMigrations(name: string): Promise<void> {
  process.env.DATABASE_URL = dbUrl(name);
  const ds = new DataSource(buildDatabaseOptions());
  await ds.initialize();
  try {
    await ds.runMigrations({ transaction: 'all' });
  } finally {
    await ds.destroy();
  }
}

export async function dropDatabase(name: string) {
  await admin((c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
}

export async function createUser(
  db: DataSource,
  opts: {
    email: string;
    role: 'SUPER_ADMIN' | 'STORE_ADMIN';
    mustChangePassword?: boolean;
    isActive?: boolean;
  },
): Promise<{ id: string; email: string }> {
  const hash = await argon2.hash(PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const [row] = await db.query(
    `INSERT INTO users (username, "fullName", email, role, "passwordHash", "mustChangePassword", "isActive")
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      opts.email.split('@')[0],
      `Usuario ${opts.role}`,
      opts.email,
      opts.role,
      hash,
      opts.mustChangePassword ?? false,
      opts.isActive ?? true,
    ],
  );
  return { id: row.id, email: opts.email };
}

export async function createTestApp(seedSql?: string): Promise<TestContext> {
  const name = await createLegacyDatabase(seedSql);
  await runMigrations(name);
  process.env.DATABASE_URL = dbUrl(name);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app);
  await app.init();
  const db = app.get(DataSource);

  const superAdmin = await createUser(db, {
    email: 'sa@kenova.test',
    role: 'SUPER_ADMIN',
  });
  const storeAdmin = await createUser(db, {
    email: 'tienda@kenova.test',
    role: 'STORE_ADMIN',
  });

  const http = () => request(app.getHttpServer());
  const login = async (email: string, password = PASSWORD) => {
    const res = await http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email, password });
    if (res.status !== 200)
      throw new Error(
        `login failed: ${res.status} ${JSON.stringify(res.body)}`,
      );
    const raw = res.headers['set-cookie'] as unknown as string[];
    return raw[0].split(';')[0];
  };

  return {
    app,
    db,
    http,
    superAdmin,
    storeAdmin,
    login,
    close: async () => {
      await app.close();
      await dropDatabase(name);
    },
  };
}
