import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Result {
  orders: { id: string; code: string; clientName: string; device: string }[];
  clients: { id: string; name: string; phoneNumber: string | null }[];
}

describe('Quick search', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let vc: string;
  let jose: { id: string };
  let order: { id: string; code: string };

  const send = (cookie: string, url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const search = async (q: string, cookie = main) =>
    (
      await t
        .http()
        .get(`/api/search?q=${encodeURIComponent(q)}`)
        .set('Cookie', cookie)
    ).body as Result;

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
    jose = (
      await send(main, '/api/clients', {
        firstName: 'José',
        lastName: 'Peña Ruiz',
        phoneNumber: '+34 612 345 678',
      })
    ).body as { id: string };
    const device = (
      await send(main, '/api/devices', {
        imei: '353987650112233',
        type: 'smartphone',
        brand: 'Apple',
        model: 'iPhone 13 Pro',
        clientId: jose.id,
      })
    ).body as { id: string };
    order = (
      await send(main, '/api/service-orders', {
        clientId: jose.id,
        deviceId: device.id,
      })
    ).body as { id: string; code: string };

    const store = (
      await send(sa, '/api/stores', {
        name: 'Villarcayo',
        city: 'Villarcayo',
        prefix: 'VC',
      })
    ).body as { id: string };
    await send(sa, '/api/users', {
      username: 'villarcayo',
      fullName: 'Tienda Villarcayo',
      email: 'vc@kenova.test',
      temporaryPassword: PASSWORD,
      storeId: store.id,
    });
    // Skip the forced change of the temporary password.
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = 'vc@kenova.test'`,
    );
    vc = await t.login('vc@kenova.test');
  });
  afterAll(() => t.close());

  it('needs at least two characters', async () => {
    expect(await search('j')).toEqual({ orders: [], clients: [] });
    expect(await search('   ')).toEqual({ orders: [], clients: [] });
  });

  it('finds clients and their orders by name, ignoring accents and case', async () => {
    for (const q of ['jose pena', 'JOSÉ', 'peña ruiz']) {
      const found = await search(q);
      expect(found.clients).toEqual([
        { id: jose.id, name: 'José Peña Ruiz', phoneNumber: '+34 612 345 678' },
      ]);
      expect(found.orders).toEqual([
        expect.objectContaining({
          id: order.id,
          code: order.code,
          clientName: 'José Peña Ruiz',
          device: 'Apple iPhone 13 Pro',
        }),
      ]);
    }
  });

  it('finds an order by its code, its device or its IMEI', async () => {
    const ids = async (q: string) => (await search(q)).orders.map((o) => o.id);
    expect(await ids(order.code.toLowerCase())).toEqual([order.id]);
    expect(await ids('iphone 13')).toEqual([order.id]);
    expect(await ids('3539 8765')).toEqual([order.id]);
  });

  it('finds a client by phone however it is typed', async () => {
    const names = async (q: string) =>
      (await search(q)).clients.map((c) => c.name);
    expect(await names('612 34')).toEqual(['José Peña Ruiz']);
    expect(await names('612-345-678')).toEqual(['José Peña Ruiz']);
  });

  it('treats LIKE wildcards as plain text', async () => {
    expect(await search('%%')).toEqual({ orders: [], clients: [] });
    expect(await search('__')).toEqual({ orders: [], clients: [] });
  });

  it('a store only finds what it may see; the partners find everything', async () => {
    expect(await search('jose')).not.toEqual({ orders: [], clients: [] });
    expect(await search('jose', vc)).toEqual({ orders: [], clients: [] });
    expect(await search('612 345 678', vc)).toEqual({
      orders: [],
      clients: [],
    });
    expect((await search('jose', sa)).orders).toHaveLength(1);
  });

  it('needs a session', async () => {
    const res = await t.http().get('/api/search?q=jose');
    expect(res.status).toBe(401);
  });
});
