import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Item {
  kind: string;
  id: string;
  title: string;
  detail: string | null;
  deletedBy: string | null;
}

describe('Papelera (R2 3.10)', () => {
  let t: TestContext;
  let sa: string;
  let store: string;
  let clientId: string;
  let orderId: string;
  let orderCode: string;
  let partId: string;

  const send = (
    method: 'post' | 'delete',
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
  const trash = async (query = '') =>
    (await t.http().get(`/api/trash${query}`).set('Cookie', sa)).body as {
      items: Item[];
      total: number;
    };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
    clientId = (
      await send('post', sa, '/api/clients', {
        firstName: 'Lucía',
        lastName: 'Gómez',
        phoneNumber: '600111222',
      })
    ).body.id;
    const deviceId = (
      await send('post', sa, '/api/devices', {
        type: 'movil',
        brand: 'Apple',
        model: 'iPhone 13',
        clientId,
      })
    ).body.id;
    const order = (
      await send('post', sa, '/api/service-orders', {
        clientId,
        deviceId,
        totalPrice: 120,
      })
    ).body;
    orderId = order.id;
    orderCode = order.code;
    partId = (
      await send('post', sa, '/api/inventory', {
        sku: 'BAT-IP13',
        name: 'Batería iPhone 13',
        stock: 1,
      })
    ).body.id;
  });
  afterAll(() => t.close());

  it('starts empty, and only the partners see it', async () => {
    expect(await trash()).toEqual({ items: [], total: 0 });
    const res = await t.http().get('/api/trash').set('Cookie', store);
    expect(res.status).toBe(403);
  });

  it('lists what was deleted, newest first, with who deleted it', async () => {
    expect(
      (await send('delete', sa, `/api/service-orders/${orderId}`)).status,
    ).toBe(204);
    await send('delete', sa, `/api/inventory/${partId}`);
    await send('delete', sa, `/api/clients/${clientId}`);

    const { items, total } = await trash();
    expect(total).toBe(3);
    expect(items.map((i) => [i.kind, i.title, i.detail])).toEqual([
      ['client', 'Lucía Gómez', '600111222'],
      ['part', 'Batería iPhone 13', 'BAT-IP13'],
      ['order', orderCode, 'Lucía Gómez · Apple iPhone 13'],
    ]);
    const [{ fullName }] = await t.db.query(
      `SELECT "fullName" FROM users WHERE id = $1`,
      [t.superAdmin.id],
    );
    expect(items.map((i) => i.deletedBy)).toEqual([
      fullName,
      fullName,
      fullName,
    ]);
  });

  it('filters by kind and by text', async () => {
    expect((await trash('?kind=part')).items.map((i) => i.id)).toEqual([
      partId,
    ]);
    expect((await trash('?q=lucía')).items.map((i) => i.kind)).toEqual([
      'client',
      'order',
    ]);
    expect((await trash('?kind=nope')).total).toBe(3);
  });

  it('restores an order with its number, and it leaves the bin', async () => {
    const res = await send('post', sa, `/api/trash/order/${orderId}/restore`);
    expect(res.status).toBe(204);
    const order = await t
      .http()
      .get(`/api/service-orders/${orderId}`)
      .set('Cookie', sa);
    expect(order.status).toBe(200);
    expect(order.body.code).toBe(orderCode);
    expect((await trash()).items.map((i) => i.kind)).toEqual([
      'client',
      'part',
    ]);
    const audit = await t.db.query(
      `SELECT action FROM audit_events WHERE "entityId" = $1 ORDER BY "createdAt"`,
      [orderId],
    );
    expect(audit.map((r: { action: string }) => r.action)).toContain(
      'SERVICE_ORDER_RECOVERED',
    );
  });

  it('restores a client and a part', async () => {
    await send('post', sa, `/api/trash/client/${clientId}/restore`);
    await send('post', sa, `/api/trash/part/${partId}/restore`);
    expect(await trash()).toEqual({ items: [], total: 0 });
    const client = await t
      .http()
      .get(`/api/clients/${clientId}`)
      .set('Cookie', sa);
    expect(client.status).toBe(200);
  });

  it('refuses what is not in the bin, an unknown kind, and a store', async () => {
    const twice = await send('post', sa, `/api/trash/part/${partId}/restore`);
    expect(twice.status).toBe(404);
    expect(twice.body.message).toBe('No está en la papelera');
    const kind = await send('post', sa, `/api/trash/user/${partId}/restore`);
    expect(kind.status).toBe(400);
    const byStore = await send(
      'post',
      store,
      `/api/trash/part/${partId}/restore`,
    );
    expect(byStore.status).toBe(403);
  });
});
