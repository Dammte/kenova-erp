import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('IMEI lookup at intake', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let clientId: string;

  const send = (
    method: 'post' | 'patch' | 'delete',
    cookie: string,
    url: string,
    body: object = {},
  ) =>
    t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const lookup = async (imei: string, cookie = main) =>
    (
      await t
        .http()
        .get(`/api/service-orders/by-imei?imei=${encodeURIComponent(imei)}`)
        .set('Cookie', cookie)
    ).body as {
      imei: string;
      openOrders: { code: string; status: string }[];
      deliveries: {
        id: string;
        code: string;
        daysAgo: number;
        withinWarranty: boolean;
        inTrash: boolean;
        summary: string;
      }[];
    };
  const device = async (imei: string) =>
    (
      await send('post', main, '/api/devices', {
        imei,
        type: 'smartphone',
        brand: 'Apple',
        model: 'iPhone 11',
        clientId,
      })
    ).body.id as string;
  const order = async (deviceId: string, body: object = {}) =>
    (
      await send('post', main, '/api/service-orders', {
        clientId,
        deviceId,
        ...body,
      })
    ).body as { id: string; code: string };
  const deliver = (id: string) =>
    send('patch', main, `/api/service-orders/${id}`, { status: 'entregado' });

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
    clientId = (await send('post', main, '/api/clients', { firstName: 'Iker' }))
      .body.id;
  });
  afterAll(() => t.close());

  it('finds nothing for a new IMEI or a too short one', async () => {
    expect(await lookup('999999999999999')).toEqual({
      imei: '999999999999999',
      openOrders: [],
      deliveries: [],
    });
    expect((await lookup('35')).openOrders).toEqual([]);
  });

  it('warns when the device already has an open order, however it is typed', async () => {
    const id = await device('353987650112233');
    const open = await order(id);
    const found = await lookup(' 35-3987 650112233 ');
    expect(found.imei).toBe('353987650112233');
    expect(found.openOrders).toEqual([
      expect.objectContaining({ code: open.code, status: expect.any(String) }),
    ]);
  });

  it('lists past deliveries newest first, with their warranty', async () => {
    const id = await device('356789104521337');
    const old = await order(id, { totalPrice: 80 });
    await deliver(old.id);
    await t.db.query(
      `UPDATE service_orders SET "deliveredAt" = now() - interval '140 days' WHERE id = $1`,
      [old.id],
    );
    const recent = await order(id, { totalPrice: 59 });
    await deliver(recent.id);

    const { openOrders, deliveries } = await lookup('356789104521337');
    expect(openOrders).toEqual([]);
    expect(deliveries).toEqual([
      expect.objectContaining({
        code: recent.code,
        daysAgo: 0,
        withinWarranty: true,
        inTrash: false,
        summary: expect.stringMatching(/59,00 €$/),
      }),
      expect.objectContaining({
        code: old.code,
        daysAgo: 140,
        withinWarranty: false,
      }),
    ]);

    await send('delete', sa, `/api/service-orders/${recent.id}`);
    expect((await lookup('356789104521337')).deliveries[0]).toMatchObject({
      code: recent.code,
      inTrash: true,
    });
  });

  it('a store only learns about its own orders', async () => {
    await order(await device('351111222233334'));
    const store = (
      await send('post', sa, '/api/stores', {
        name: 'Villarcayo',
        city: 'Villarcayo',
        prefix: 'VC',
      })
    ).body;
    await send('post', sa, '/api/users', {
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
    const vc = await t.login('vc@kenova.test');
    expect((await lookup('351111222233334', vc)).openOrders).toEqual([]);
    expect((await lookup('351111222233334', sa)).openOrders).toHaveLength(1);
  });
});
