import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Day {
  store: { id: string; opensAt: string; closesAt: string };
  date: string;
  status: 'open' | 'closed';
  byMethod: Record<string, { amount: string; count: number }>;
  total: string;
  cash: { float: string; charges: string; refunds: string; expected: string };
  movements: {
    id: string;
    kind: string;
    method: string;
    amount: string;
    offHours: boolean;
    orderCode: string;
    clientName: string;
    userName: string | null;
  }[];
}

describe('Movimientos de dinero (GET /api/cash/day)', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcStore: string;
  let order: string;

  const send = (cookie: string, url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const get = (cookie: string, query = '') =>
    t.http().get(`/api/cash/day${query}`).set('Cookie', cookie);
  const day = async (cookie: string, query = '') => {
    const res = await get(cookie, query);
    expect(res.status).toBe(200);
    return res.body as Day;
  };
  const pay = async (body: object) => {
    const res = await send(vc, `/api/service-orders/${order}/payments`, body);
    expect(res.status).toBe(201);
  };
  /** Moves every payment of the store to a local (Spain) date and time. */
  const at = (local: string, where = 'true') =>
    t.db.query(
      `UPDATE order_payments SET "createdAt" = ($1::timestamp AT TIME ZONE 'Europe/Madrid')
        WHERE "storeId" = $2 AND ${where}`,
      [local, vcStore],
    );

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    vcStore = (
      (
        await send(sa, '/api/stores', {
          name: 'Villarcayo',
          city: 'Villarcayo',
          prefix: 'VC',
          cashOpensAt: '09:00',
          cashClosesAt: '20:30',
          cashFloat: 100,
        })
      ).body as { id: string }
    ).id;
    await send(sa, '/api/users', {
      username: 'villarcayo',
      fullName: 'Marta Ibáñez',
      email: 'vc@kenova.test',
      temporaryPassword: PASSWORD,
      storeId: vcStore,
    });
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = 'vc@kenova.test'`,
    );
    vc = await t.login('vc@kenova.test');
    const res = await send(vc, '/api/service-orders/intake', {
      client: {
        firstName: 'Marta',
        lastName: 'Ruiz',
        phoneNumber: '611000111',
      },
      device: { type: 'movil', brand: 'Apple', model: 'iPhone 13' },
      order: {
        status: 'en_progreso',
        reportedFaults: ['battery'],
        totalPrice: 500,
      },
    });
    expect(res.status).toBe(201);
    order = (res.body as { id: string }).id;
  });
  afterAll(() => t.close());

  it('starts on the current cash day with the store float and nothing taken', async () => {
    const d = await day(vc);
    expect(d.status).toBe('open');
    expect(d.store).toMatchObject({
      id: vcStore,
      opensAt: '09:00',
      closesAt: '20:30',
    });
    expect(d.total).toBe('0.00');
    expect(d.cash).toEqual({
      float: '100.00',
      charges: '0.00',
      refunds: '0.00',
      expected: '100.00',
    });
    expect(d.movements).toEqual([]);
  });

  it('adds up a day per method, net of refunds, and the expected cash', async () => {
    await pay({ kind: 'charge', amount: 35, method: 'cash' });
    await pay({ kind: 'charge', amount: 129, method: 'card' });
    await pay({
      kind: 'refund',
      amount: 20,
      method: 'cash',
      note: 'Devolución del diagnóstico',
    });
    await pay({
      kind: 'refund',
      amount: 10,
      method: 'credit',
      note: 'A saldo a favor',
    });
    await at('2026-10-29 12:00');

    const d = await day(vc, '?date=2026-10-29');
    expect(d.status).toBe('closed');
    expect(d.byMethod).toEqual({
      cash: { amount: '15.00', count: 2 },
      card: { amount: '129.00', count: 1 },
      transfer: { amount: '0.00', count: 0 },
      other: { amount: '0.00', count: 0 },
    });
    expect(d.total).toBe('144.00');
    expect(d.cash).toEqual({
      float: '100.00',
      charges: '35.00',
      refunds: '-20.00',
      expected: '115.00',
    });
    // All share one time here, so the order is not checked.
    expect(d.movements.map((m) => m.amount).sort()).toEqual([
      '-20.00',
      '129.00',
      '35.00',
    ]);
    expect(d.movements.find((m) => m.amount === '35.00')).toMatchObject({
      kind: 'charge',
      offHours: false,
      orderCode: 'VC-0001',
      clientName: 'Marta Ruiz',
      userName: 'Marta Ibáñez',
    });

    // The next day opens with what was expected at the end of this one.
    expect((await day(vc, '?date=2026-10-30')).cash.float).toBe('115.00');
  });

  it('puts a payment taken after closing on the next cash day, marked off hours', async () => {
    await pay({ kind: 'charge', amount: 50, method: 'transfer' });
    await at('2026-10-29 21:20', `method = 'transfer'`);
    expect((await day(vc, '?date=2026-10-29')).byMethod.transfer.count).toBe(0);
    const next = await day(vc, '?date=2026-10-30');
    expect(next.movements).toEqual([
      expect.objectContaining({
        method: 'transfer',
        amount: '50.00',
        offHours: true,
      }),
    ]);

    // Before opening it stays on the day about to open.
    await at('2026-10-30 08:40', `method = 'transfer'`);
    expect((await day(vc, '?date=2026-10-30')).movements[0].offHours).toBe(
      true,
    );
  });

  it('keeps a store to its own till and rejects days that have not started', async () => {
    expect(
      (await get(vc, `?storeId=00000000-0000-4000-8000-000000000000`)).status,
    ).toBe(404);
    expect((await get(vc, '?date=2099-01-01')).status).toBe(400);
    expect((await get(vc, '?date=2026-02-31')).status).toBe(400);
    expect((await get(vc, '?date=ayer')).status).toBe(400);

    // A partner sees the main store by default and any store on request.
    expect((await day(sa)).store.id).not.toBe(vcStore);
    expect((await day(sa, `?storeId=${vcStore}&date=2026-10-29`)).total).toBe(
      '144.00',
    );
  });
});
