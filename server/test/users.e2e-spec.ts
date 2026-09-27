import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('User management (SUPER_ADMIN only)', () => {
  let t: TestContext;
  let sa: string;
  let store: string;

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
  });
  afterAll(() => t.close());

  it('STORE_ADMIN cannot list, create, edit or reset users', async () => {
    expect((await t.http().get('/api/users').set('Cookie', store)).status).toBe(
      403,
    );
    expect(
      (
        await t
          .http()
          .post('/api/users')
          .set('Cookie', store)
          .set('Origin', ORIGIN)
          .send({
            username: 'x1x',
            fullName: 'X',
            email: 'x@kenova.test',
            temporaryPassword: 'Temporal-12345',
            role: 'SUPER_ADMIN',
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await t
          .http()
          .patch(`/api/users/${t.storeAdmin.id}`)
          .set('Cookie', store)
          .set('Origin', ORIGIN)
          .send({ role: 'SUPER_ADMIN' })
      ).status,
    ).toBe(403);
    expect(
      (await t.http().get('/api/audit-events').set('Cookie', store)).status,
    ).toBe(403);
  });

  it('lists users without any password material', async () => {
    const res = await t.http().get('/api/users').set('Cookie', sa);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(
      /passwordHash|"password"|argon2|failedLoginCount|lockedUntil/,
    );
  });

  it('creates users with a temporary password that must be changed', async () => {
    const res = await t
      .http()
      .post('/api/users')
      .set('Cookie', sa)
      .set('Origin', ORIGIN)
      .send({
        username: 'nueva.tienda',
        fullName: 'Nueva Tienda',
        email: 'Nueva@Tienda.test',
        temporaryPassword: 'Temporal-12345',
        id: '00000000-0000-4000-8000-000000000000', // ignored
        passwordHash: 'x', // ignored
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: 'nueva@tienda.test',
      role: 'STORE_ADMIN',
      mustChangePassword: true,
    });
    expect(res.body.id).not.toBe('00000000-0000-4000-8000-000000000000');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|Temporal-12345/);

    const dup = await t
      .http()
      .post('/api/users')
      .set('Cookie', sa)
      .set('Origin', ORIGIN)
      .send({
        username: 'otra',
        fullName: 'Otra',
        email: 'nueva@tienda.test',
        temporaryPassword: 'Temporal-12345',
      });
    expect(dup.status).toBe(409);
  });

  it('rejects weak temporary passwords', async () => {
    const res = await t
      .http()
      .post('/api/users')
      .set('Cookie', sa)
      .set('Origin', ORIGIN)
      .send({
        username: 'debil',
        fullName: 'Débil',
        email: 'debil@tienda.test',
        temporaryPassword: '123456',
      });
    expect(res.status).toBe(400);
  });

  it('a SUPER_ADMIN cannot demote or disable themselves', async () => {
    const res = await t
      .http()
      .patch(`/api/users/${t.superAdmin.id}`)
      .set('Cookie', sa)
      .set('Origin', ORIGIN)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('deactivating a user closes their sessions immediately', async () => {
    const victimCookie = await t.login(t.storeAdmin.email);
    const res = await t
      .http()
      .delete(`/api/users/${t.storeAdmin.id}`)
      .set('Cookie', sa)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(204);
    expect(
      (await t.http().get('/api/clients').set('Cookie', victimCookie)).status,
    ).toBe(401);
    const [row] = await t.db.query(
      `SELECT "isActive" FROM users WHERE id = $1`,
      [t.storeAdmin.id],
    );
    expect(row.isActive).toBe(false); // deactivated, not deleted
  });

  it('records user administration in the audit log', async () => {
    const res = await t.http().get('/api/audit-events').set('Cookie', sa);
    expect(res.status).toBe(200);
    const actions = res.body.map((e: any) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'USER_CREATED',
        'USER_DEACTIVATED',
        'AUTH_LOGIN_SUCCEEDED',
      ]),
    );
  });
});
