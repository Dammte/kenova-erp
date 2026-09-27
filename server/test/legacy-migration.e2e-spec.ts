import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from '../src/config/database.config';
import { SecretCipher } from '../src/common/crypto/secret-cipher';
import {
  createLegacyDatabase,
  dropDatabase,
  runMigrations,
} from './utils/harness';

/** Runs the migration over data shaped like today's production rows (all fictitious). */
describe('Security foundation migration over legacy data', () => {
  let name: string;
  let db: DataSource;

  beforeAll(async () => {
    name = await createLegacyDatabase(`
      INSERT INTO users (id, username, "fullName", email, role, password) VALUES
        ('11111111-1111-4111-8111-111111111111', 'admin', 'Admin Ficticio', 'admin@example.test', 'ADMIN', 'texto-plano'),
        ('22222222-2222-4222-8222-222222222222', 'mgr', 'Manager Ficticio', 'mgr@example.test', 'MANAGER', 'otro');
      INSERT INTO client (id, "firstName", "lastName", dni) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ana', 'Prueba', ''),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Beto', 'Prueba', '00000000T');
      INSERT INTO devices (id, type, brand, model, code, pattern, client_id) VALUES
        ('d1111111-1111-4111-8111-111111111111', 'movil', 'Marca', 'M1', '1234', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        ('d2222222-2222-4222-8222-222222222222', 'movil', 'Marca', 'M2', '', '1-5-9', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        ('d3333333-3333-4333-8333-333333333333', 'movil', 'Marca', 'M3', NULL, NULL, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      INSERT INTO service_orders (id, "clientId", "deviceId") VALUES
        ('0e111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1111111-1111-4111-8111-111111111111');
      INSERT INTO service_history (action, description, "serviceOrderId", "performedBy") VALUES
        ('nota', 'hecha por admin', '0e111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');
    `);
    await runMigrations(name);
    db = new DataSource({
      ...buildDatabaseOptions(),
      entities: [],
      migrations: [],
    });
    await db.initialize();
  });
  afterAll(async () => {
    await db.destroy();
    await dropDatabase(name);
  });

  it('removes plaintext passwords and disables legacy accounts without deleting them', async () => {
    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
    );
    expect(cols.map((c: any) => c.column_name)).not.toContain('password');
    const users = await db.query(
      `SELECT username, role, "isActive", "passwordHash" FROM users ORDER BY username`,
    );
    expect(users).toEqual([
      {
        username: 'admin',
        role: 'SUPER_ADMIN',
        isActive: false,
        passwordHash: null,
      },
      {
        username: 'mgr',
        role: 'STORE_ADMIN',
        isActive: false,
        passwordHash: null,
      },
    ]);
    const [h] = await db.query(`SELECT "performedBy" FROM service_history`);
    expect(h.performedBy).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('encrypts existing codes and patterns and drops the plaintext columns', async () => {
    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'devices'`,
    );
    const names = cols.map((c: any) => c.column_name);
    expect(names).not.toContain('code');
    expect(names).not.toContain('pattern');

    const rows = await db.query(
      `SELECT id, "unlockSecretType" t, "unlockSecretCiphertext" c FROM devices ORDER BY id`,
    );
    const cipher = SecretCipher.fromEnv();
    expect(rows[0].t).toBe('CODE');
    expect(cipher.decrypt(rows[0].c, rows[0].id)).toBe('1234');
    expect(rows[1].t).toBe('PATTERN');
    expect(cipher.decrypt(rows[1].c, rows[1].id)).toBe('1-5-9');
    expect(rows[2].c).toBeNull();
  });

  it("turns '' DNIs into NULL so several clients without DNI can coexist", async () => {
    const [c] = await db.query(
      `SELECT dni FROM client WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`,
    );
    expect(c.dni).toBeNull();
    await db.query(
      `INSERT INTO client ("firstName", "lastName") VALUES ('Sin', 'Dni'), ('Otro', 'Sin Dni')`,
    );
  });

  it('no longer cascades a client delete to its orders', async () => {
    await expect(
      db.query(
        `DELETE FROM client WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`,
      ),
    ).rejects.toThrow(/foreign key/);
    const orders = await db.query(`SELECT id FROM service_orders`);
    expect(orders).toHaveLength(1);
  });

  it('can be reverted (rollback path) restoring the unlock codes', async () => {
    const ds = new DataSource(buildDatabaseOptions());
    await ds.initialize();
    await ds.undoLastMigration({ transaction: 'all' });
    const rows = await ds.query(
      `SELECT code, pattern FROM devices ORDER BY id`,
    );
    expect(rows[0]).toEqual({ code: '1234', pattern: null });
    expect(rows[1]).toEqual({ code: null, pattern: '1-5-9' });
    await ds.runMigrations({ transaction: 'all' });
    await ds.destroy();
  });
});
