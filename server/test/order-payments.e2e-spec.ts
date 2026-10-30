import { randomUUID } from 'crypto';
import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Order payments: charges and refunds', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let clientId: string;

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
  const get = (cookie: string, url: string) =>
    t.http().get(url).set('Cookie', cookie);
  const newOrder = async (body: object) =>
    (await send('post', main, '/api/service-orders', { clientId, ...body }))
      .body.id as string;
  const pay = (orderId: string, body: object, cookie = main) =>
    send('post', cookie, `/api/service-orders/${orderId}/payments`, {
      method: 'cash',
      ...body,
    });
  const order = async (id: string) =>
    (await get(sa, `/api/service-orders/${id}`)).body as {
      amountPaid: string;
      balance: string;
      paymentStatus: string;
    };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
    clientId = (await send('post', sa, '/api/clients', { firstName: 'Lucía' }))
      .body.id;
  });
  afterAll(() => t.close());

  it('an amount paid at creation is recorded as a charge', async () => {
    const id = await newOrder({
      totalPrice: 149,
      amountPaid: 59,
      paymentMethod: 'card',
    });
    const res = await get(main, `/api/service-orders/${id}/payments`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        kind: 'charge',
        amount: '59.00',
        method: 'card',
        origin: 'order_edit',
        note: 'Pagado al crear la orden',
        createdBy: { id: t.storeAdmin.id, fullName: expect.any(String) },
      }),
    ]);
  });

  it('charges up to what is pending and derives the status', async () => {
    const id = await newOrder({ totalPrice: 149, amountPaid: 59 });

    const tooMuch = await pay(id, { kind: 'charge', amount: 100 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toContain('Máximo 90,00 €');
    expect((await pay(id, { kind: 'charge', amount: 0 })).status).toBe(400);
    expect((await pay(id, { kind: 'charge', amount: 1.005 })).status).toBe(400);

    const ok = await pay(id, {
      kind: 'charge',
      amount: 90,
      method: 'card',
      note: 'datáfono',
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      kind: 'charge',
      amount: '90.00',
      method: 'card',
      origin: 'counter',
      note: 'datáfono',
    });
    expect(await order(id)).toMatchObject({
      amountPaid: '149.00',
      balance: '0.00',
      paymentStatus: 'paid',
    });

    const again = await pay(id, { kind: 'charge', amount: 1 });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Esta orden ya está pagada');
  });

  it('refunds need a reason and at most what was charged', async () => {
    const id = await newOrder({ totalPrice: 149, amountPaid: 149 });
    expect((await pay(id, { kind: 'refund', amount: 20 })).status).toBe(400);
    const tooMuch = await pay(id, {
      kind: 'refund',
      amount: 200,
      note: 'garantía',
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toContain('Máximo 149,00 €');

    const ok = await pay(id, {
      kind: 'refund',
      amount: 20,
      note: 'Funda no disponible',
    });
    expect(ok.status).toBe(201);
    expect(await order(id)).toMatchObject({
      amountPaid: '129.00',
      balance: '20.00',
      paymentStatus: 'paid_partial',
    });
  });

  it('a retried charge with the same id is recorded once', async () => {
    const id = await newOrder({ totalPrice: 100 });
    const paymentId = randomUUID();
    const first = await pay(id, { id: paymentId, kind: 'charge', amount: 40 });
    const retry = await pay(id, { id: paymentId, kind: 'charge', amount: 40 });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(paymentId);
    expect((await order(id)).amountPaid).toBe('40.00');
    const other = await pay(id, { id: paymentId, kind: 'charge', amount: 41 });
    expect(other.status).toBe(409);
  });

  it('simultaneous charges never take more than what is pending', async () => {
    const id = await newOrder({ totalPrice: 100 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => pay(id, { kind: 'charge', amount: 30 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect((await order(id)).amountPaid).toBe('90.00');
  });

  it('editing "pagado" on the current screens records the difference', async () => {
    const id = await newOrder({ totalPrice: 100 });
    await send('patch', main, `/api/service-orders/${id}`, {
      amountPaid: 50,
      paymentMethod: 'transfer',
    });
    await send('patch', main, `/api/service-orders/${id}`, { amountPaid: 20 });
    await send('patch', main, `/api/service-orders/${id}`, { notes: 'x' });
    const payments = (await get(main, `/api/service-orders/${id}/payments`))
      .body as { kind: string; amount: string; method: string }[];
    expect(payments.map((p) => [p.kind, p.amount, p.method])).toEqual([
      ['charge', '50.00', 'transfer'],
      ['refund', '30.00', 'transfer'],
    ]);
  });

  it("a store cannot see or touch another store's payments", async () => {
    const id = await newOrder({ totalPrice: 100 });
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
    expect((await get(vc, `/api/service-orders/${id}/payments`)).status).toBe(
      404,
    );
    expect((await pay(id, { kind: 'charge', amount: 10 }, vc)).status).toBe(
      404,
    );

    // The money is recorded in the store that took it.
    const vcOrder = (
      await send('post', vc, '/api/service-orders', {
        clientId,
        totalPrice: 50,
      })
    ).body.id;
    const charge = await pay(vcOrder, { kind: 'charge', amount: 50 }, vc);
    expect(charge.body.storeId).toBe(store.id);
  });

  it('charges minus refunds always equal what each order has paid', async () => {
    const mismatches = await t.db.query(`
      SELECT o.id FROM service_orders o
        LEFT JOIN (SELECT "orderId",
                          sum(CASE kind WHEN 'charge' THEN amount ELSE -amount END) AS net
                     FROM order_payments GROUP BY "orderId") p ON p."orderId" = o.id
       WHERE coalesce(p.net, 0) <> coalesce(o."amountPaid", 0)`);
    expect(mismatches).toEqual([]);
  });
});
