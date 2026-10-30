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
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Beto', 'Prueba', '00000000T'),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Solo', ' ', NULL);
      INSERT INTO devices (id, type, brand, model, code, pattern, client_id) VALUES
        ('d1111111-1111-4111-8111-111111111111', 'movil', 'Marca', 'M1', '1234', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        ('d2222222-2222-4222-8222-222222222222', 'movil', 'Marca', 'M2', '', '1-5-9', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        ('d3333333-3333-4333-8333-333333333333', 'movil', 'Marca', 'M3', NULL, NULL, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      UPDATE devices SET status = 'broken_screen' WHERE id = 'd1111111-1111-4111-8111-111111111111';
      UPDATE devices SET status = 'pantalla y más' WHERE id = 'd2222222-2222-4222-8222-222222222222';
      INSERT INTO service_orders (id, "clientId", "deviceId") VALUES
        ('0e111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1111111-1111-4111-8111-111111111111');
      INSERT INTO service_orders (id, "clientId", "deviceId", "createdAt") VALUES
        ('0e222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'd2222222-2222-4222-8222-222222222222', '2025-01-15');
      INSERT INTO inventory (id, sku, name, "costPrice") VALUES
        ('f1111111-1111-4111-8111-111111111111', 'C1', 'Coma', '12,50'),
        ('f2222222-2222-4222-8222-222222222222', 'C2', 'Euro', ' 8 €'),
        ('f3333333-3333-4333-8333-333333333333', 'C3', 'Texto', 'consultar'),
        ('f4444444-4444-4444-8444-444444444444', 'C4', 'Vacio', '');
      UPDATE service_orders SET status = 'entregado', "updatedAt" = '2025-03-10'
        WHERE id = '0e222222-2222-4222-8222-222222222222';
      INSERT INTO services (id, name, description, price) VALUES
        ('5e111111-1111-4111-8111-111111111111', 'Pantalla', 'x', 90),
        ('5e222222-2222-4222-8222-222222222222', 'Batería', 'x', 40);
      INSERT INTO service_order_services ("serviceOrderId", "serviceId") VALUES
        ('0e111111-1111-4111-8111-111111111111', '5e111111-1111-4111-8111-111111111111'),
        ('0e111111-1111-4111-8111-111111111111', '5e222222-2222-4222-8222-222222222222');
      UPDATE service_orders SET "totalPrice" = 120, "amountPaid" = 50, "paymentMethod" = 'card',
             "updatedAt" = '2025-04-01'
        WHERE id = '0e111111-1111-4111-8111-111111111111';
      INSERT INTO service_history (action, description, "serviceOrderId", "performedBy") VALUES
        ('nota', 'hecha por admin', '0e111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');
      INSERT INTO service_history (action, description, "serviceOrderId", "createdAt") VALUES
        ('cambio_estado', 'Estado cambiado de "En Progreso" a "Finalizado"', '0e222222-2222-4222-8222-222222222222', '2025-03-01 10:00'),
        ('cambio_estado', 'Estado cambiado de "Finalizado" a "Entregado"', '0e222222-2222-4222-8222-222222222222', '2025-03-05 12:00');
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
    const orders = await db.query(
      `SELECT id FROM service_orders WHERE "clientId" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`,
    );
    expect(orders).toHaveLength(1);
  });

  it('turns blank last names into NULL and keeps the rest', async () => {
    const rows = await db.query(
      `SELECT "firstName", "lastName" FROM client
        WHERE id IN ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
        ORDER BY "firstName"`,
    );
    expect(rows).toEqual([
      { firstName: 'Beto', lastName: 'Prueba' },
      { firstName: 'Solo', lastName: null },
    ]);
  });

  it('converts costs to numbers and keeps the ones that are not', async () => {
    const rows = await db.query(
      `SELECT sku, "costPrice" FROM inventory WHERE sku LIKE 'C%' ORDER BY sku`,
    );
    expect(rows).toEqual([
      { sku: 'C1', costPrice: '12.5000' },
      { sku: 'C2', costPrice: '8.0000' },
      { sku: 'C3', costPrice: null },
      { sku: 'C4', costPrice: null },
    ]);
    const kept = await db.query(
      `SELECT "inventoryId", "costPrice" FROM inventory_cost_price_legacy`,
    );
    expect(kept).toEqual([
      {
        inventoryId: 'f3333333-3333-4333-8333-333333333333',
        costPrice: 'consultar',
      },
    ]);
  });

  it('dates finished and delivered orders from their history', async () => {
    const [done] = await db.query(
      `SELECT to_char("finishedAt" AT TIME ZONE current_setting('TimeZone'), 'YYYY-MM-DD HH24:MI') AS f,
              to_char("deliveredAt" AT TIME ZONE current_setting('TimeZone'), 'YYYY-MM-DD HH24:MI') AS d
         FROM service_orders WHERE id = '0e222222-2222-4222-8222-222222222222'`,
    );
    expect(done).toEqual({ f: '2025-03-01 10:00', d: '2025-03-05 12:00' });
    const [open] = await db.query(
      `SELECT "finishedAt", "deliveredAt" FROM service_orders
        WHERE id = '0e111111-1111-4111-8111-111111111111'`,
    );
    expect(open).toEqual({ finishedAt: null, deliveredAt: null });
  });

  it('copies the known device fault to its orders', async () => {
    const rows = await db.query(
      `SELECT o.id, o."reportedFaults" FROM service_orders o ORDER BY o.id`,
    );
    expect(rows).toEqual([
      {
        id: '0e111111-1111-4111-8111-111111111111',
        reportedFaults: ['broken_screen'],
      },
      { id: '0e222222-2222-4222-8222-222222222222', reportedFaults: [] },
    ]);
    const [device] = await db.query(
      `SELECT status FROM devices WHERE id = 'd2222222-2222-4222-8222-222222222222'`,
    );
    expect(device.status).toBe('pantalla y más');
  });

  it('gives each order priced lines that add up to its total', async () => {
    const lines = await db.query(
      `SELECT "orderId", position, kind, description, "unitPrice"
         FROM order_lines ORDER BY "orderId", position`,
    );
    expect(lines).toEqual([
      {
        orderId: '0e111111-1111-4111-8111-111111111111',
        position: 1,
        kind: 'service',
        description: 'Batería',
        unitPrice: '40.00',
      },
      {
        orderId: '0e111111-1111-4111-8111-111111111111',
        position: 2,
        kind: 'service',
        description: 'Pantalla',
        unitPrice: '90.00',
      },
      {
        orderId: '0e111111-1111-4111-8111-111111111111',
        position: 3,
        kind: 'adjustment',
        description: 'Ajuste',
        unitPrice: '-10.00',
      },
    ]);
  });

  it('turns what each order had paid into one migrated charge', async () => {
    const payments = await db.query(
      `SELECT p."orderId", p.kind, p.amount, p.method, p.origin, p."createdAt",
              p."storeId" = o."storeId" AS "sameStore"
         FROM order_payments p JOIN service_orders o ON o.id = p."orderId"`,
    );
    expect(payments).toEqual([
      {
        orderId: '0e111111-1111-4111-8111-111111111111',
        kind: 'charge',
        amount: '50.00',
        method: 'card',
        origin: 'migrated',
        createdAt: new Date('2025-04-01'),
        sameStore: true,
      },
    ]);
  });

  it('numbers existing orders in the main store by date of entry', async () => {
    const orders = await db.query(
      `SELECT o.id, o.number, o.code, s.prefix
         FROM service_orders o JOIN stores s ON s.id = o."storeId"
        ORDER BY o.number`,
    );
    expect(orders).toEqual([
      {
        id: '0e222222-2222-4222-8222-222222222222',
        number: 1,
        code: 'MP-0001',
        prefix: 'MP',
      },
      {
        id: '0e111111-1111-4111-8111-111111111111',
        number: 2,
        code: 'MP-0002',
        prefix: 'MP',
      },
    ]);
    const [main] = await db.query(
      `SELECT "nextOrderNumber" FROM stores WHERE "isMain"`,
    );
    expect(main.nextOrderNumber).toBe(3);
  });

  it('can be reverted (rollback path) restoring the unlock codes', async () => {
    const ds = new DataSource(buildDatabaseOptions());
    await ds.initialize();
    // Revert the later migrations first, then SecurityFoundation itself.
    let last: string | undefined;
    do {
      await ds.undoLastMigration({ transaction: 'all' });
      const [row] = await ds.query(
        `SELECT name FROM migrations ORDER BY id DESC LIMIT 1`,
      );
      last = row?.name;
    } while (last && last !== 'InitialSchema1758000000000');
    const rows = await ds.query(
      `SELECT code, pattern FROM devices ORDER BY id`,
    );
    expect(rows[0]).toEqual({ code: '1234', pattern: null });
    expect(rows[1]).toEqual({ code: null, pattern: '1-5-9' });
    const [cost] = await ds.query(
      `SELECT "costPrice" FROM inventory WHERE sku = 'C3'`,
    );
    expect(cost.costPrice).toBe('consultar');
    await ds.runMigrations({ transaction: 'all' });
    await ds.destroy();
  });
});
