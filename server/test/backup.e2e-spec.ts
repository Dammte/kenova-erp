import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Table {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

describe('Copia de seguridad (R2 3.13)', () => {
  let t: TestContext;
  let sa: string;
  let store: string;

  const exportAll = (cookie: string) =>
    t
      .http()
      .post('/api/backup/export')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
  const status = (cookie: string) =>
    t.http().get('/api/backup/status').set('Cookie', cookie);

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
    await t
      .http()
      .post('/api/clients')
      .set('Cookie', sa)
      .set('Origin', ORIGIN)
      .send({ firstName: 'Iker', phoneNumber: '600111222' });
  });
  afterAll(() => t.close());

  it('only the partners export or see the last export', async () => {
    expect((await exportAll(store)).status).toBe(403);
    expect((await status(store)).status).toBe(403);
  });

  it('starts with no export recorded', async () => {
    const res = await status(sa);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lastExportAt: null, by: null });
  });

  it('exports every business table, without secrets or sessions', async () => {
    const res = await exportAll(sa);
    expect(res.status).toBe(200);
    const tables = res.body.tables as Table[];
    const names = tables.map((x) => x.name);
    expect(names.slice(0, 3)).toEqual(['service_orders', 'client', 'devices']);
    expect(names).toEqual(
      expect.arrayContaining(['audit_events', 'shipments', 'stores', 'users']),
    );
    expect(names).not.toContain('sessions');
    expect(names).not.toContain('password_reset_tokens');

    const clients = tables.find((x) => x.name === 'client')!;
    expect(clients.rows).toEqual([
      expect.objectContaining({ firstName: 'Iker', phoneNumber: '600111222' }),
    ]);
    const users = tables.find((x) => x.name === 'users')!;
    expect(users.columns).not.toContain('passwordHash');
    expect(users.rows.length).toBeGreaterThan(0);
    expect(users.rows[0]).not.toHaveProperty('passwordHash');
    const devices = tables.find((x) => x.name === 'devices')!;
    expect(devices.columns).not.toContain('unlockSecretCiphertext');
  });

  it('records who exported and when', async () => {
    const res = await status(sa);
    expect(res.body.by).toBe('Usuario SUPER_ADMIN');
    expect(Date.now() - Date.parse(res.body.lastExportAt)).toBeLessThan(60_000);
    const [audit] = await t.db.query(
      `SELECT metadata FROM audit_events WHERE action = 'BACKUP_EXPORTED'`,
    );
    expect(audit.metadata.rows).toMatchObject({ client: 1 });
  });
});
