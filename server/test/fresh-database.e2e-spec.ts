import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from '../src/config/database.config';
import { Client as PgClient } from 'pg';
import {
  createEmptyDatabase,
  databaseUrl,
  dropDatabase,
  runMigrations,
} from './utils/harness';

/** A new deployment starts from an empty database and only runs migrations. */
describe('Migrations on an empty database', () => {
  let name: string;
  let db: DataSource;

  beforeAll(async () => {
    name = await createEmptyDatabase();
    await runMigrations(name);
    process.env.DATABASE_URL = databaseUrl(name);
    db = new DataSource(buildDatabaseOptions());
    await db.initialize();
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    await dropDatabase(name);
  });

  it('creates the full schema, matching the entities exactly', async () => {
    const pending = await db.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((q) => q.query)).toEqual([]);
  });

  it('records every migration', async () => {
    const rows = await db.query(`SELECT name FROM migrations ORDER BY id`);
    expect(rows.map((r: any) => r.name)).toEqual([
      'InitialSchema1758000000000',
      'SecurityFoundation1759000000000',
      'PasswordResetTokens1761400000000',
      'Stores1761900000000',
      'OrderNumber1762000000000',
      'ClientLastNameOptional1762100000000',
      'NumericCostPrice1762200000000',
      'OrderLifecycleDates1762300000000',
      'OrderIntakeFields1762400000000',
      'OrderLines1762500000000',
      'ClientStore1762600000000',
      'OrderPayments1762700000000',
      'OrderOutcome1762800000000',
      'ClientCompany1762900000000',
      'ClientAnonymized1763000000000',
      'ClientCredit1763100000000',
      'Shipments1763200000000',
    ]);
  });

  it('reverts cleanly back to an empty database', async () => {
    for (let i = 0; i < 17; i++) {
      await db.undoLastMigration({ transaction: 'all' });
    }
    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name <> 'migrations'`,
    );
    expect(tables).toEqual([]);
    await db.runMigrations({ transaction: 'all' });
    const pending = await db.driver.createSchemaBuilder().log();
    expect(pending.upQueries).toEqual([]);
  });
});

/** Supabase installs uuid-ossp in the `extensions` schema, outside search_path. */
describe('Migrations on an empty Supabase-like database', () => {
  let name: string;

  beforeAll(async () => {
    name = await createEmptyDatabase();
    const c = new PgClient({ connectionString: databaseUrl(name) });
    await c.connect();
    await c.query(`CREATE SCHEMA extensions`);
    await c.query(`CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions`);
    await c.end();
    await runMigrations(name);
  });
  afterAll(async () => {
    await dropDatabase(name);
  });

  it('uses the extension where it is installed, so id defaults work', async () => {
    const c = new PgClient({ connectionString: databaseUrl(name) });
    await c.connect();
    try {
      const [client] = (
        await c.query(
          `INSERT INTO client ("firstName", "lastName") VALUES ('Ana', 'Prueba') RETURNING id`,
        )
      ).rows;
      expect(client.id).toMatch(/^[0-9a-f-]{36}$/);
      const [user] = (
        await c.query(
          `INSERT INTO users (username, "fullName", email, role) VALUES ('u1', 'U', 'u@k.test', 'SUPER_ADMIN') RETURNING id`,
        )
      ).rows;
      const [session] = (
        await c.query(
          `INSERT INTO sessions ("tokenHash", "userId", "lastSeenAt", "expiresAt")
           VALUES (repeat('a', 64), $1, now(), now()) RETURNING id`,
          [user.id],
        )
      ).rows;
      expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
      const ext = await c.query(
        `SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE extname = 'uuid-ossp'`,
      );
      expect(ext.rows).toEqual([{ nspname: 'extensions' }]);
    } finally {
      await c.end();
    }
  });
});
