import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Readable order numbers per store', () => {
  let t: TestContext;
  let sa: string;
  let store: string;
  let clientId: string;

  const post = (cookie: string, url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const newOrder = async (cookie: string, body: object = {}) => {
    const res = await post(cookie, '/api/service-orders', {
      clientId,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; number: number; code: string };
  };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
    clientId = (
      await post(store, '/api/clients', { firstName: 'Ana', lastName: 'Ruiz' })
    ).body.id;
  });
  afterAll(() => t.close());

  it('numbers orders of the main store MP-0001, MP-0002…', async () => {
    const a = await newOrder(store);
    const b = await newOrder(sa);
    expect([a.code, b.code]).toEqual(['MP-0001', 'MP-0002']);
    expect([a.number, b.number]).toEqual([1, 2]);
    const read = await t
      .http()
      .get(`/api/service-orders/${a.id}`)
      .set('Cookie', store);
    expect(read.body.code).toBe('MP-0001');
  });

  it('the intake numbers its order too', async () => {
    const res = await post(store, '/api/service-orders/intake', {
      clientId,
      device: { type: 'movil', brand: 'Apple', model: 'iPhone 13' },
      order: {},
    });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('MP-0003');
  });

  it('ignores a number or code sent by the client', async () => {
    const o = await newOrder(store, { number: 1, code: 'MP-0001' });
    expect(o.code).toBe('MP-0004');
  });

  it('a deleted order keeps its number and it is never reused', async () => {
    const o = await newOrder(store);
    expect(o.code).toBe('MP-0005');
    const del = await t
      .http()
      .delete(`/api/service-orders/${o.id}`)
      .set('Cookie', sa)
      .set('Origin', ORIGIN);
    expect(del.status).toBe(204);
    expect((await newOrder(store)).code).toBe('MP-0006');
  });

  it('never hands out the same number twice under concurrency', async () => {
    const orders = await Promise.all(
      Array.from({ length: 10 }, () => newOrder(store)),
    );
    const numbers = orders.map((o) => o.number).sort((x, y) => x - y);
    expect(numbers).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('each store has its own prefix and its own sequence', async () => {
    const vc = (
      await post(sa, '/api/stores', {
        name: 'Villarcayo',
        city: 'Villarcayo',
        prefix: 'VC',
      })
    ).body;
    await post(sa, '/api/users', {
      username: 'villarcayo',
      fullName: 'Tienda Villarcayo',
      email: 'vc@kenova.test',
      temporaryPassword: PASSWORD,
      storeId: vc.id,
    });
    // Skip the forced change of the temporary password.
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = 'vc@kenova.test'`,
    );
    const vcCookie = await t.login('vc@kenova.test');

    const o = await newOrder(vcCookie);
    expect(o.code).toBe('VC-0001');
    const [row] = await t.db.query(
      `SELECT "storeId" FROM service_orders WHERE id = $1`,
      [o.id],
    );
    expect(row.storeId).toBe(vc.id);
    // The main store's sequence is untouched.
    expect((await newOrder(store)).code).toBe('MP-0017');
  });

  it('the database refuses a repeated number in the same store', async () => {
    await expect(
      t.db.query(
        `UPDATE service_orders SET "number" = 1
          WHERE code = 'MP-0002'`,
      ),
    ).rejects.toThrow(/IDX_service_orders_store_number/);
  });
});
