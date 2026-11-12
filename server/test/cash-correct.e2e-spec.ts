import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Line {
  id: string;
  kind: string;
  method: string;
  amount: string;
  corrected: { by: string | null; before: string; reason: string } | null;
}
interface Day {
  date: string;
  byMethod: Record<string, { amount: string; count: number }>;
  cash: { manual: string; expected: string };
  movements: Line[];
}

/** Design 3.2 «Corregir un día cerrado»: partners fix a closed day's line. */
describe('Movimientos de dinero · corregir (POST /api/cash/corrections)', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcStore: string;
  let order: string;

  const send = (cookie: string, url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const day = async (cookie: string, query: string) => {
    const res = await t
      .http()
      .get(`/api/cash/day${query}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as Day;
  };
  const correct = (cookie: string, body: object) =>
    send(cookie, '/api/cash/corrections', { storeId: vcStore, ...body });
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

  it("changes the method of a closed day's charge and keeps what it was", async () => {
    const charge = await pay('2026-10-26 10:00', {
      kind: 'charge',
      amount: 129,
      method: 'card',
    });
    const res = await correct(sa, {
      lineId: charge,
      method: 'cash',
      reason: 'Se marcó tarjeta y pagó en efectivo',
    });
    expect(res.status).toBe(201);
    const d = res.body as Day;
    expect(d.date).toBe('2026-10-26');
    expect(d.byMethod.card.amount).toBe('0.00');
    expect(d.byMethod.cash.amount).toBe('129.00');
    const line = d.movements.find((m) => m.id === charge)!;
    expect(line.method).toBe('cash');
    expect(line.corrected).toMatchObject({
      before: 'card',
      reason: 'Se marcó tarjeta y pagó en efectivo',
    });
    // What the order has paid does not change.
    const [o] = await t.db.query<{ amountPaid: string }[]>(
      `SELECT "amountPaid"::text AS "amountPaid" FROM service_orders WHERE id = $1`,
      [order],
    );
    expect(Number(o.amountPaid)).toBe(129);
    const audit = await t.db.query<{ field: string; after: string }[]>(
      `SELECT field, after FROM cash_corrections WHERE "paymentId" = $1`,
      [charge],
    );
    expect(audit).toEqual([{ field: 'method', after: 'cash' }]);
  });

  it("changes the amount of a closed day's exit, and the cash after it", async () => {
    const [{ id }] = await t.db.query<{ id: string }[]>(
      `INSERT INTO cash_movements ("storeId", kind, amount, reason, "createdAt")
       VALUES ($1, 'out', 12.5, 'Adhesivo', ('2026-10-27 13:00'::timestamp AT TIME ZONE 'Europe/Madrid'))
       RETURNING id`,
      [vcStore],
    );
    const before = await day(sa, `?storeId=${vcStore}&date=2026-10-28`);
    const res = await correct(sa, {
      lineId: id,
      amount: 21.5,
      reason: 'Ticket de 21,50',
    });
    expect(res.status).toBe(201);
    const d = res.body as Day;
    expect(d.cash.manual).toBe('-21.50');
    expect(d.movements[0].corrected?.before).toBe('12.50');
    const after = await day(sa, `?storeId=${vcStore}&date=2026-10-28`);
    expect(Number(after.cash.expected)).toBeCloseTo(
      Number(before.cash.expected) - 9,
    );
  });

  it('refuses what it must not change', async () => {
    const charge = await pay('2026-10-26 11:00', {
      kind: 'charge',
      amount: 10,
      method: 'card',
    });
    const open = await pay(null, { kind: 'charge', amount: 5, method: 'card' });
    const reason = 'Error';
    // A store account cannot correct.
    expect(
      (await correct(vc, { lineId: charge, method: 'cash', reason })).status,
    ).toBe(403);
    // A charge's amount is a refund, not a correction.
    expect(
      (await correct(sa, { lineId: charge, amount: 8, reason })).status,
    ).toBe(400);
    // The open day is fixed from the order.
    expect(
      (await correct(sa, { lineId: open, method: 'cash', reason })).status,
    ).toBe(400);
    // Nothing to change, no reason, saldo a favor.
    expect(
      (await correct(sa, { lineId: charge, method: 'card', reason })).status,
    ).toBe(400);
    expect(
      (await correct(sa, { lineId: charge, method: 'cash', reason: ' ' }))
        .status,
    ).toBe(400);
    expect(
      (await correct(sa, { lineId: charge, method: 'credit', reason })).status,
    ).toBe(400);
    // Another store's line is not found.
    const res = await correct(sa, {
      storeId: undefined,
      lineId: charge,
      method: 'cash',
      reason,
    });
    expect(res.status).toBe(404);
  });
});
