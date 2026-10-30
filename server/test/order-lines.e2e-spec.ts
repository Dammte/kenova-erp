import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Line {
  kind: string;
  description: string;
  unitPrice: string;
  quantity: number;
  serviceId: string | null;
}

describe('Priced order lines', () => {
  let t: TestContext;
  let cookie: string;
  let clientId: string;
  let screen: string;
  let battery: string;

  const send = (method: 'post' | 'patch', url: string, body: object) =>
    t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const linesOf = (body: { lines: Line[] }) =>
    body.lines.map((l) => [l.kind, l.description, l.unitPrice]);
  const sum = (lines: Line[]) =>
    lines.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0);
  const service = async (name: string, price: number) =>
    (
      await send('post', '/api/services', {
        name,
        description: name,
        price,
        available: true,
      })
    ).body.id as string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.superAdmin.email);
    clientId = (await send('post', '/api/clients', { firstName: 'Noa' })).body
      .id;
    screen = await service('Pantalla', 89.9);
    battery = await service('Batería', 45);
  });
  afterAll(() => t.close());

  it('creates one line per service at its price', async () => {
    const res = await send('post', '/api/service-orders', {
      clientId,
      serviceIds: [screen, battery],
    });
    expect(res.status).toBe(201);
    expect(linesOf(res.body)).toEqual([
      ['service', 'Batería', '45.00'],
      ['service', 'Pantalla', '89.90'],
    ]);
    expect(sum(res.body.lines)).toBeCloseTo(Number(res.body.totalPrice));
  });

  it('adds an adjustment line when the agreed total differs', async () => {
    const res = await send('post', '/api/service-orders', {
      clientId,
      serviceIds: [screen],
      totalPrice: 80,
    });
    expect(linesOf(res.body)).toEqual([
      ['service', 'Pantalla', '89.90'],
      ['adjustment', 'Ajuste', '-9.90'],
    ]);

    const none = await send('post', '/api/service-orders', {
      clientId,
      totalPrice: 50,
    });
    expect(linesOf(none.body)).toEqual([['adjustment', 'Ajuste', '50.00']]);

    const empty = await send('post', '/api/service-orders', { clientId });
    expect(empty.body.lines).toEqual([]);
  });

  it('keeps the price an order already had when the catalog changes', async () => {
    const o = (
      await send('post', '/api/service-orders', {
        clientId,
        serviceIds: [battery],
      })
    ).body;
    await send('patch', `/api/services/${battery}`, { price: 60 });

    const res = await send('patch', `/api/service-orders/${o.id}`, {
      totalPrice: 50,
    });
    expect(res.status).toBe(200);
    expect(linesOf(res.body)).toEqual([
      ['service', 'Batería', '45.00'],
      ['adjustment', 'Ajuste', '5.00'],
    ]);
  });

  it('follows the services when they change', async () => {
    const o = (
      await send('post', '/api/service-orders', {
        clientId,
        serviceIds: [screen, battery],
        totalPrice: 100,
      })
    ).body;
    const res = await send('patch', `/api/service-orders/${o.id}`, {
      serviceIds: [screen],
    });
    expect(linesOf(res.body)).toEqual([
      ['service', 'Pantalla', '89.90'],
      ['adjustment', 'Ajuste', '10.10'],
    ]);
    expect(sum(res.body.lines)).toBeCloseTo(100);
  });

  it('only an adjustment may be negative', async () => {
    const o = (
      await send('post', '/api/service-orders', {
        clientId,
        serviceIds: [screen],
      })
    ).body;
    await expect(
      t.db.query(
        `UPDATE order_lines SET "unitPrice" = -1 WHERE "orderId" = $1 AND kind = 'service'`,
        [o.id],
      ),
    ).rejects.toThrow(/CHK_order_lines_price_nonnegative/);
  });
});
