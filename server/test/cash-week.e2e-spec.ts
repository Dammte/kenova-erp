import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Week {
  from: string;
  to: string;
  days: {
    date: string;
    status: string;
    byMethod: Record<string, string>;
    total: string;
    manual: string;
    movements: number;
    counted: boolean;
  }[];
  byMethod: Record<string, string>;
  total: string;
  manual: string;
}

/** Design 3.2 «Semana»: a week of cash days, one row per day. */
describe('Movimientos de dinero · semana (GET /api/cash/week)', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcStore: string;
  let order: string;

  const send = (cookie: string, url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const week = async (cookie: string, query = '') => {
    const res = await t
      .http()
      .get(`/api/cash/week${query}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as Week;
  };
  /** A payment of the order, then moved to a local (Spain) date and time. */
  const moveTo = (local: string, id: string) =>
    t.db.query(
      `UPDATE order_payments SET "createdAt" = ($1::timestamp AT TIME ZONE 'Europe/Madrid') WHERE id = $2`,
      [local, id],
    );
  const pay = async (local: string | null, body: object) => {
    const res = await send(vc, `/api/service-orders/${order}/payments`, body);
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    if (local) await moveTo(local, id);
    return id;
  };

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
      client: { firstName: 'Marta', phoneNumber: '611000111' },
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

  it('sums each cash day of a past week from Monday to Sunday', async () => {
    // A cash charge refunded in part, each then moved to its day.
    const cash = await pay(null, {
      kind: 'charge',
      amount: 35,
      method: 'cash',
    });
    const refund = await pay(null, {
      kind: 'refund',
      amount: 20,
      method: 'cash',
      refundOf: cash,
      note: 'Pieza no usada',
    });
    await moveTo('2026-10-26 10:00', cash);
    await moveTo('2026-10-28 11:00', refund);
    await pay('2026-10-26 12:00', {
      kind: 'charge',
      amount: 129,
      method: 'card',
    });
    // After closing on Thursday: it belongs to Friday.
    await pay('2026-10-29 21:00', {
      kind: 'charge',
      amount: 50,
      method: 'transfer',
    });
    await t.db.query(
      `INSERT INTO cash_movements ("storeId", kind, amount, reason, "createdAt")
       VALUES ($1, 'out', 12.5, 'Adhesivo', ('2026-10-28 13:00'::timestamp AT TIME ZONE 'Europe/Madrid'))`,
      [vcStore],
    );
    await t.db.query(
      `INSERT INTO cash_counts ("storeId", date, cash) VALUES ($1, '2026-10-26', 135)`,
      [vcStore],
    );

    const w = await week(vc, '?date=2026-10-28');
    expect([w.from, w.to]).toEqual(['2026-10-26', '2026-11-01']);
    expect(w.days.map((d) => d.date)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    const [mon, tue, wed, thu, fri] = w.days;
    expect(mon).toMatchObject({
      status: 'closed',
      total: '164.00',
      movements: 2,
      counted: true,
    });
    expect(mon.byMethod).toMatchObject({ cash: '35.00', card: '129.00' });
    expect(tue).toMatchObject({ total: '0.00', movements: 0, counted: false });
    expect(wed).toMatchObject({
      total: '-20.00',
      manual: '-12.50',
      movements: 2,
    });
    expect(thu.movements).toBe(0);
    expect(fri.byMethod.transfer).toBe('50.00');
    expect(w.byMethod).toMatchObject({
      cash: '15.00',
      card: '129.00',
      transfer: '50.00',
      other: '0.00',
    });
    expect([w.total, w.manual]).toEqual(['194.00', '-12.50']);
  });

  it('stops the current week at the cash day running now', async () => {
    const w = await week(vc);
    const last = w.days.at(-1)!;
    expect(last.status).toBe('open');
    expect(w.to).toBe(last.date);
    expect(w.days.length).toBeLessThanOrEqual(7);
    expect(w.days[0].date).toBe(w.from);
  });

  it('keeps a store to its own till and rejects weeks that have not started', async () => {
    expect(
      (
        await t
          .http()
          .get(`/api/cash/week?storeId=00000000-0000-4000-8000-000000000000`)
          .set('Cookie', vc)
      ).status,
    ).toBe(404);
    expect(
      (await t.http().get('/api/cash/week?date=2099-01-01').set('Cookie', vc))
        .status,
    ).toBe(400);
    const own = await week(sa, `?storeId=${vcStore}&date=2026-10-28`);
    expect(own.total).toBe('194.00');
  });
});
