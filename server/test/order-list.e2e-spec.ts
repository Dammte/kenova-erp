import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Row {
  id: string;
  code: string;
  status: string;
  priority: string;
  clientName: string;
  phoneNumber: string | null;
  device: string;
  faults: string[];
  services: string[];
  totalPrice: number;
  balance: number;
  days: number | null;
  uncollected: boolean;
}
interface List {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
}

describe('Order list', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let lucia: string;
  let iker: string;
  let screen: string;

  const send = (
    method: 'post' | 'patch',
    cookie: string,
    url: string,
    body: object,
  ) =>
    t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const list = async (params = '', cookie = main) => {
    const res = await t
      .http()
      .get(`/api/service-orders/list${params}`)
      .set('Cookie', cookie);
    return { status: res.status, body: res.body as List };
  };
  const codes = (l: List) => l.rows.map((r) => r.code);
  const order = async (body: object) =>
    (await send('post', main, '/api/service-orders', body)).body as {
      id: string;
      code: string;
    };
  const setStatus = (id: string, status: string) =>
    send('patch', main, `/api/service-orders/${id}`, { status });

  let urgent: { id: string; code: string };
  let oldMedium: { id: string; code: string };
  let newMedium: { id: string; code: string };
  let finished: { id: string; code: string };
  let delivered: { id: string; code: string };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
    screen = (
      (
        await send('post', sa, '/api/services', {
          name: 'Cambio de pantalla',
          description: 'Pantalla',
          price: 129,
          available: true,
        })
      ).body as { id: string }
    ).id;
    lucia = (
      (
        await send('post', main, '/api/clients', {
          firstName: 'Lucía',
          lastName: 'Fernández',
          phoneNumber: '612 345 678',
        })
      ).body as { id: string }
    ).id;
    iker = (
      (await send('post', main, '/api/clients', { firstName: 'Iker' }))
        .body as { id: string }
    ).id;
    const iphone = (
      (
        await send('post', main, '/api/devices', {
          imei: '353987650112233',
          type: 'smartphone',
          brand: 'Apple',
          model: 'iPhone 13',
          clientId: lucia,
        })
      ).body as { id: string }
    ).id;

    oldMedium = await order({ clientId: iker, priority: 'medium' });
    newMedium = await order({ clientId: iker, priority: 'medium' });
    urgent = await order({
      clientId: lucia,
      deviceId: iphone,
      priority: 'urgent',
      serviceIds: [screen],
      reportedFaults: ['broken_screen'],
      amountPaid: 39,
    });
    finished = await order({ clientId: iker });
    await setStatus(finished.id, 'finalizado');
    delivered = await order({ clientId: iker, totalPrice: 20, amountPaid: 20 });
    await setStatus(delivered.id, 'entregado');

    await t.db.query(
      `UPDATE service_orders SET "createdAt" = now() - interval '40 days' WHERE id = $1`,
      [oldMedium.id],
    );
    await t.db.query(
      `UPDATE service_orders SET "finishedAt" = now() - interval '8 days' WHERE id = $1`,
      [finished.id],
    );
  });
  afterAll(() => t.close());

  it('opens on the open orders, most urgent first and then the oldest', async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(codes(body)).toEqual([
      urgent.code,
      oldMedium.code,
      newMedium.code,
      finished.code,
    ]);
    expect(body).toMatchObject({ total: 4, page: 1, pageSize: 50 });
    expect(body.counts).toMatchObject({
      open: 4,
      all: 5,
      pendiente_cliente: 3,
      finalizado: 1,
      entregado: 1,
      cancelado: 0,
    });
  });

  it('gives each row what the list shows', async () => {
    const rows = (await list()).body.rows;
    expect(rows[0]).toMatchObject({
      clientName: 'Lucía Fernández',
      phoneNumber: '612 345 678',
      device: 'Apple iPhone 13',
      faults: ['broken_screen'],
      services: ['Cambio de pantalla'],
      totalPrice: 129,
      balance: 90,
      days: 0,
      uncollected: false,
    });
    expect(rows[1].days).toBe(40);
    expect(rows[3]).toMatchObject({ days: 8, uncollected: true });
  });

  it('filters by tab and by money owed', async () => {
    expect(codes((await list('?tab=finalizado')).body)).toEqual([
      finished.code,
    ]);
    const delivered_ = (await list('?tab=entregado')).body.rows[0];
    expect(delivered_).toMatchObject({ code: delivered.code, days: null });
    expect((await list('?tab=all')).body.total).toBe(5);
    expect(codes((await list('?debt=true')).body)).toEqual([urgent.code]);
  });

  it('searches by code, name without accents, device, phone or IMEI', async () => {
    for (const q of [
      urgent.code.toLowerCase(),
      'lucia',
      'iphone 13',
      '612 34',
      '3539 8765',
    ]) {
      expect(codes((await list(`?q=${encodeURIComponent(q)}`)).body)).toEqual([
        urgent.code,
      ]);
    }
    // The tab counts ignore the search.
    expect((await list('?q=lucia')).body.counts.open).toBe(4);
  });

  it('rejects an unknown tab or page', async () => {
    expect((await list('?tab=nope')).status).toBe(400);
    expect((await list('?page=0')).status).toBe(400);
  });

  it('pages 50 rows at a time', async () => {
    for (let i = 0; i < 50; i++)
      await order({ clientId: iker, priority: 'low' });
    const first = (await list()).body;
    expect(first.rows).toHaveLength(50);
    expect(first.total).toBe(54);
    const second = (await list('?page=2')).body;
    expect(second.rows).toHaveLength(4);
    expect(second.page).toBe(2);
  });

  it('a store only lists its own orders; the partners list all', async () => {
    const store = (
      await send('post', sa, '/api/stores', {
        name: 'Villarcayo',
        city: 'Villarcayo',
        prefix: 'VC',
      })
    ).body as { id: string };
    await send('post', sa, '/api/users', {
      username: 'villarcayo',
      fullName: 'Tienda Villarcayo',
      email: 'vc@kenova.test',
      temporaryPassword: PASSWORD,
      storeId: store.id,
    });
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = 'vc@kenova.test'`,
    );
    const vc = await t.login('vc@kenova.test');
    const own = (await list('', vc)).body;
    expect(own.total).toBe(0);
    expect(own.counts.all).toBe(0);
    expect((await list('?tab=all', sa)).body.total).toBe(55);
  });
});
