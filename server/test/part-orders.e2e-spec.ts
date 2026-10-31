import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Row {
  id: string;
  orderCode: string;
  orderStatus: string;
  partName: string;
  provider: string | null;
  quantity: number;
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  waitingDays: number;
  late: boolean;
}

describe('Part orders (/api/part-orders)', () => {
  let t: TestContext;
  let sa: string;
  let clientId: string;
  let partId: string;

  const post = (url: string, body: object = {}) =>
    t.http().post(url).set('Cookie', sa).set('Origin', ORIGIN).send(body);
  const get = (url: string) => t.http().get(url).set('Cookie', sa);
  const idOf = async (url: string, body: object) =>
    ((await post(url, body)).body as { id: string }).id;
  const newOrder = async (status?: string) => {
    const id = await idOf('/api/service-orders', { clientId });
    if (status) {
      await t
        .http()
        .patch(`/api/service-orders/${id}`)
        .set('Cookie', sa)
        .set('Origin', ORIGIN)
        .send({ status });
    }
    return id;
  };
  const stockOf = async (id: string) =>
    ((await get(`/api/inventory/${id}`)).body as { stock: number }).stock;

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    clientId = await idOf('/api/clients', { firstName: 'P', lastName: 'P' });
    partId = await idOf('/api/inventory', {
      sku: 'PAN-IP13',
      name: 'Pantalla iPhone 13 OLED',
      provider: 'MovilParts',
      stock: 0,
    });
  });
  afterAll(() => t.close());

  it('orders a stock part and moves the order to «Pendiente de piezas»', async () => {
    const orderId = await newOrder('en_progreso');
    const res = await post('/api/part-orders', {
      orderId,
      inventoryId: partId,
      expectedAt: '2999-01-01',
    });
    expect(res.status).toBe(400);

    const ok = await post('/api/part-orders', { orderId, inventoryId: partId });
    expect(ok.status).toBe(201);
    const row = ok.body as Row;
    // Name and supplier come from the part.
    expect(row).toMatchObject({
      partName: 'Pantalla iPhone 13 OLED',
      provider: 'MovilParts',
      quantity: 1,
      orderStatus: 'pendiente_piezas',
      receivedAt: null,
      waitingDays: 0,
      late: false,
    });
    const order = (await get(`/api/service-orders/${orderId}`)).body as {
      status: string;
      serviceHistory: { action: string }[];
    };
    expect(order.status).toBe('pendiente_piezas');
    expect(order.serviceHistory.map((h) => h.action)).toContain(
      'cambio_estado',
    );
  });

  it('receives it once: the stock goes up and the order notes it', async () => {
    const orderId = await newOrder();
    const { id } = (
      await post('/api/part-orders', {
        orderId,
        inventoryId: partId,
        quantity: 2,
        provider: 'RecambiosNorte',
      })
    ).body as Row;
    const before = await stockOf(partId);

    const [a, b] = await Promise.all([
      post(`/api/part-orders/${id}/receive`),
      post(`/api/part-orders/${id}/receive`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await stockOf(partId)).toBe(before + 2);
    const done = (a.status === 200 ? a : b).body as Row;
    expect(done.receivedAt).not.toBeNull();
    expect(done.receivedBy).toEqual(expect.any(String));
    expect(done.provider).toBe('RecambiosNorte');

    const moves = (await get(`/api/inventory/${partId}/movements`)).body as {
      kind: string;
      quantity: number;
      note: string;
    }[];
    expect(moves[0]).toMatchObject({ kind: 'purchase', quantity: 2 });
    expect(moves[0].note).toMatch(/^Pedido de /);
    const order = (await get(`/api/service-orders/${orderId}`)).body as {
      status: string;
      serviceHistory: { action: string; description: string }[];
    };
    // The technician moves it back to «En progreso» themselves.
    expect(order.status).toBe('pendiente_piezas');
    expect(
      order.serviceHistory.find((h) => h.action === 'pieza_recibida')
        ?.description,
    ).toBe('Pieza recibida: Pantalla iPhone 13 OLED (2)');

    expect(
      (
        await t
          .http()
          .delete(`/api/part-orders/${id}`)
          .set('Cookie', sa)
          .set('Origin', ORIGIN)
      ).status,
    ).toBe(409);
  });

  it('orders a part kept out of stock by name, and lists pending and late first', async () => {
    const orderId = await newOrder();
    expect((await post('/api/part-orders', { orderId })).status).toBe(400);
    const { id } = (
      await post('/api/part-orders', {
        orderId,
        partName: '  Flex botón home iPad 9 ',
      })
    ).body as Row;
    // Ordered ten days ago without a date: late.
    await t.db.query(
      `UPDATE part_orders SET "orderedAt" = "orderedAt" - 10 WHERE id = $1`,
      [id],
    );
    const pending = (await get('/api/part-orders?pending=true')).body as Row[];
    expect(pending[0]).toMatchObject({
      id,
      partName: 'Flex botón home iPad 9',
      inventoryId: null,
      waitingDays: 10,
      late: true,
    });
    expect(pending.every((r) => r.receivedAt === null)).toBe(true);
    const all = (await get('/api/part-orders')).body as Row[];
    expect(all.length).toBeGreaterThan(pending.length);
    expect(all.at(-1)?.receivedAt).not.toBeNull();
    expect(
      ((await get(`/api/part-orders?orderId=${orderId}`)).body as Row[]).map(
        (r) => r.id,
      ),
    ).toEqual([id]);

    // Received without a stock part: nothing to raise, still noted.
    expect((await post(`/api/part-orders/${id}/receive`)).status).toBe(200);
  });

  it('cancels a pending one and refuses closed orders', async () => {
    const orderId = await newOrder();
    const { id } = (await post('/api/part-orders', { orderId, partName: 'x' }))
      .body as Row;
    const del = await t
      .http()
      .delete(`/api/part-orders/${id}`)
      .set('Cookie', sa)
      .set('Origin', ORIGIN);
    expect(del.status).toBe(204);
    expect((await get(`/api/part-orders?orderId=${orderId}`)).body).toEqual([]);

    const closed = await newOrder('cancelado');
    const res = await post('/api/part-orders', {
      orderId: closed,
      partName: 'x',
    });
    expect(res.status).toBe(400);
  });

  it('is for the partners only', async () => {
    const store = await t.login(t.storeAdmin.email);
    expect(
      (await t.http().get('/api/part-orders').set('Cookie', store)).status,
    ).toBe(403);
  });
});
