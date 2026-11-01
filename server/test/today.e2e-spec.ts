import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Summary {
  counts: Record<string, number | string>;
  toNotify: { total: number; rows: { id: string; days: number }[] };
  lateParts: { total: number; rows: { id: string; days: number }[] };
  uncollected: {
    total: number;
    rows: { id: string; days: number; balance: string; notices: number }[];
  };
  lowStock: { total: number; rows: { sku: string; stock: number }[] } | null;
  week: { day: string; received: number; delivered: number }[];
  openByStatus: Record<string, number>;
}

describe('Panel «Hoy» (GET /api/today)', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcStore: string;

  const send = (
    method: 'post' | 'patch',
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
  const today = async (cookie: string, query = '') => {
    const res = await t.http().get(`/api/today${query}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as Summary;
  };
  let phone = 600000000;
  const intake = async (cookie: string, order: object = {}) => {
    phone += 1;
    const res = await send('post', cookie, '/api/service-orders/intake', {
      client: { firstName: 'Nerea', phoneNumber: String(phone) },
      device: { type: 'movil', brand: 'Xiaomi', model: 'Redmi Note 12' },
      order: {
        status: 'en_progreso',
        reportedFaults: ['battery'],
        totalPrice: 100,
        ...order,
      },
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  const finish = (id: string, daysAgo: number) =>
    t.db.query(
      `UPDATE service_orders SET status = 'finalizado', "finishedAt" = now() - make_interval(days => $2) WHERE id = $1`,
      [id, daysAgo],
    );

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    vcStore = (
      await send('post', sa, '/api/stores', {
        name: 'Villarcayo',
        city: 'Villarcayo',
        prefix: 'VC',
      })
    ).body.id;
    await send('post', sa, '/api/users', {
      username: 'villarcayo',
      fullName: 'Tienda Villarcayo',
      email: 'vc@kenova.test',
      temporaryPassword: PASSWORD,
      storeId: vcStore,
    });
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = 'vc@kenova.test'`,
    );
    vc = await t.login('vc@kenova.test');
  });
  afterAll(() => t.close());

  it('counts what came in and what is in progress today', async () => {
    await intake(vc, { priority: 'urgent' });
    await intake(vc);
    const { counts, week, openByStatus } = await today(vc);
    expect(counts).toMatchObject({
      received: 2,
      receivedLastWeek: 0,
      inProgress: 2,
      inProgressUrgent: 1,
    });
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({ received: 2, delivered: 0 });
    expect(openByStatus.en_progreso).toBe(2);
  });

  it('lists finished orders without a «ready» notice until one is sent', async () => {
    const id = await intake(vc);
    await finish(id, 2);
    let s = await today(vc);
    expect(s.counts.readyNotNotified).toBe(1);
    expect(s.toNotify.rows).toEqual([expect.objectContaining({ id, days: 2 })]);
    await send('post', vc, `/api/service-orders/${id}/notices`, {
      trigger: 'ready',
      body: 'Hola Nerea, ya está.',
    });
    s = await today(vc);
    expect(s.counts).toMatchObject({ ready: 1, readyNotNotified: 0 });
    expect(s.toNotify.total).toBe(0);
  });

  it('flags parts waited for over 7 days, from when the order went into that status', async () => {
    const id = await intake(vc);
    await send('patch', vc, `/api/service-orders/${id}`, {
      status: 'pendiente_piezas',
    });
    expect((await today(vc)).lateParts.total).toBe(0);
    await t.db.query(
      `UPDATE service_history SET "performedAt" = now() - interval '10 days'
        WHERE "serviceOrderId" = $1 AND action = 'cambio_estado'`,
      [id],
    );
    const s = await today(vc);
    expect(s.counts).toMatchObject({ waitingParts: 1, waitingPartsLate: 1 });
    expect(s.lateParts.rows).toEqual([
      expect.objectContaining({ id, days: 10 }),
    ]);
  });

  it('shows devices not collected after 30 days, what they owe and the notices sent', async () => {
    const id = await intake(vc, { amountPaid: 41, paymentMethod: 'cash' });
    await finish(id, 44);
    const { uncollected, counts } = await today(vc);
    expect(uncollected.rows).toEqual([
      expect.objectContaining({ id, days: 44, balance: '59.00', notices: 0 }),
    ]);
    expect(counts.collectedToday).toBe('41.00');
    expect(Number(counts.pendingBalance)).toBeGreaterThanOrEqual(59);
  });

  it('keeps a store to its own figures and stock to the partners', async () => {
    expect(
      (
        await t
          .http()
          .get(`/api/today?storeId=00000000-0000-4000-8000-000000000000`)
          .set('Cookie', vc)
      ).status,
    ).toBe(404);
    expect((await today(vc)).lowStock).toBeNull();

    await t.db.query(
      `INSERT INTO inventory (sku, name, stock, "minimalStock") VALUES ('PAN-IP13', 'Pantalla iPhone 13', 0, 2), ('BAT-OK', 'Batería con stock', 9, 2)`,
    );
    await intake(sa);
    const all = await today(sa);
    expect(all.lowStock?.rows.map((r) => r.sku)).toEqual(['PAN-IP13']);
    expect(all.counts.received).toBe(
      Number((await today(vc)).counts.received) + 1,
    );
    expect((await today(sa, `?storeId=${vcStore}`)).counts.received).toBe(
      (await today(vc)).counts.received,
    );
  });
  it('counts an order taken in just after midnight in Madrid as today', async () => {
    const before = (await today(vc)).counts.received;
    // service_orders."createdAt" holds UTC wall-clock time. 00:30 in Madrid
    // today is still the day before in UTC.
    const madrid = (time: string, days = 0) =>
      `((date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') + make_interval(days => ${days}) + interval '${time}')
         AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC'`;
    const justAfter = await intake(vc);
    const lastNight = await intake(vc);
    await t.db.query(
      `UPDATE service_orders SET "createdAt" = ${madrid('00:30')} WHERE id = $1`,
      [justAfter],
    );
    await t.db.query(
      `UPDATE service_orders SET "createdAt" = ${madrid('23:30', -1)} WHERE id = $1`,
      [lastNight],
    );
    const { counts, week } = await today(vc);
    expect(counts.received).toBe(Number(before) + 1);
    expect(week[6].received).toBe(Number(before) + 1);
  });
});
