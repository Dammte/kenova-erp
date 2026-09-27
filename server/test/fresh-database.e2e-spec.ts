import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from '../src/config/database.config';
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

  it('records both migrations', async () => {
    const rows = await db.query(`SELECT name FROM migrations ORDER BY id`);
    expect(rows.map((r: any) => r.name)).toEqual([
      'InitialSchema1758000000000',
      'SecurityFoundation1759000000000',
    ]);
  });

  it('reverts cleanly back to an empty database', async () => {
    await db.undoLastMigration({ transaction: 'all' });
    await db.undoLastMigration({ transaction: 'all' });
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
