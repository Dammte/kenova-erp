import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Stores and the store of each user', () => {
  let t: TestContext;
  let sa: string;
  let store: string;
  let mainId: string;

  const post = (path: string, cookie: string, body: object) =>
    t.http().post(path).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const patch = (path: string, cookie: string, body: object) =>
    t.http().patch(path).set('Cookie', cookie).set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
    const res = await t.http().get('/api/stores').set('Cookie', sa);
    mainId = res.body.find((s: { isMain: boolean }) => s.isMain).id;
  });
  afterAll(() => t.close());

  it('the migration creates Medina de Pomar as the main store', async () => {
    const res = await t.http().get('/api/stores').set('Cookie', sa);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      name: 'Medina de Pomar',
      prefix: 'MP',
      isMain: true,
      isActive: true,
    });
  });

  it('assigns existing store accounts to the main store', async () => {
    const [row] = await t.db.query(
      `SELECT "storeId" FROM users WHERE id = $1`,
      [t.storeAdmin.id],
    );
    expect(row.storeId).toBe(mainId);
    const me = await t.http().get('/api/auth/me').set('Cookie', store);
    expect(me.body.user.storeId).toBe(mainId);
  });

  it('the database refuses a STORE_ADMIN without a store', async () => {
    await expect(
      t.db.query(`UPDATE users SET "storeId" = NULL WHERE id = $1`, [
        t.storeAdmin.id,
      ]),
    ).rejects.toThrow(/CHK_users_store_admin_store/);
  });

  it('only SUPER_ADMIN creates and edits stores', async () => {
    const body = { name: 'Villarcayo', city: 'Villarcayo', prefix: 'vc' };
    expect((await post('/api/stores', store, body)).status).toBe(403);
    expect(
      (await patch(`/api/stores/${mainId}`, store, { name: 'X' })).status,
    ).toBe(403);

    const res = await post('/api/stores', sa, body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      prefix: 'VC',
      isMain: false,
      isActive: true,
    });
  });

  it('rejects a repeated or malformed prefix', async () => {
    const dup = await post('/api/stores', sa, {
      name: 'Otra',
      city: 'Otra',
      prefix: 'VC',
    });
    expect(dup.status).toBe(409);
    const bad = await post('/api/stores', sa, {
      name: 'Otra',
      city: 'Otra',
      prefix: 'V1',
    });
    expect(bad.status).toBe(400);
  });

  it('the prefix of a store with orders cannot change and the main store cannot be deactivated', async () => {
    // As if it had already numbered four orders.
    await t.db.query(`UPDATE stores SET "nextOrderNumber" = 5 WHERE id = $1`, [
      mainId,
    ]);
    const res = await patch(`/api/stores/${mainId}`, sa, { prefix: 'XX' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'El prefijo no se puede cambiar: ya hay 4 órdenes con MP-',
    );
    const off = await patch(`/api/stores/${mainId}`, sa, { isActive: false });
    expect(off.status).toBe(400);
  });

  it('a STORE_ADMIN only sees its own store', async () => {
    const list = await t.http().get('/api/stores').set('Cookie', store);
    expect(list.body.map((s: { id: string }) => s.id)).toEqual([mainId]);

    const all = await t.http().get('/api/stores').set('Cookie', sa);
    const other = all.body.find((s: { prefix: string }) => s.prefix === 'VC');
    const res = await t
      .http()
      .get(`/api/stores/${other.id}`)
      .set('Cookie', store);
    expect(res.status).toBe(404);
  });

  it('new store accounts go to the main store unless another is given', async () => {
    const all = await t.http().get('/api/stores').set('Cookie', sa);
    const vc = all.body.find((s: { prefix: string }) => s.prefix === 'VC');
    const base = { fullName: 'Cuenta tienda', temporaryPassword: PASSWORD };

    const a = await post('/api/users', sa, {
      ...base,
      username: 'cuenta.a',
      email: 'a@kenova.test',
    });
    expect(a.status).toBe(201);
    expect(a.body.storeId).toBe(mainId);

    const b = await post('/api/users', sa, {
      ...base,
      username: 'cuenta.b',
      email: 'b@kenova.test',
      storeId: vc.id,
    });
    expect(b.body.storeId).toBe(vc.id);

    const promoted = await patch(`/api/users/${b.body.id}`, sa, {
      role: 'SUPER_ADMIN',
    });
    expect(promoted.body.storeId).toBeNull();
  });

  it('deactivating a store signs its users out and blocks new sign-ins', async () => {
    const created = await post('/api/stores', sa, {
      name: 'Espinosa de los Monteros',
      city: 'Espinosa de los Monteros',
      prefix: 'ES',
    });
    const user = await post('/api/users', sa, {
      username: 'espinosa',
      fullName: 'Tienda Espinosa',
      email: 'espinosa@kenova.test',
      temporaryPassword: PASSWORD,
      storeId: created.body.id,
    });
    expect(user.status).toBe(201);
    const cookie = await t.login('espinosa@kenova.test');
    expect(
      (await t.http().get('/api/auth/me').set('Cookie', cookie)).status,
    ).toBe(200);

    const off = await patch(`/api/stores/${created.body.id}`, sa, {
      isActive: false,
    });
    expect(off.status).toBe(200);
    expect(
      (await t.http().get('/api/auth/me').set('Cookie', cookie)).status,
    ).toBe(401);
    const again = await t
      .http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'espinosa@kenova.test', password: PASSWORD });
    expect(again.status).toBe(401);

    // A user cannot be moved to an inactive store either.
    const move = await patch(`/api/users/${t.storeAdmin.id}`, sa, {
      storeId: created.body.id,
    });
    expect(move.status).toBe(400);
  });
});
