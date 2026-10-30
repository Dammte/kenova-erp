import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Saldo a favor (client credit)', () => {
  let t: TestContext;
  let sa: string;
  let main: string;

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
  const newClient = async (firstName: string) =>
    (await send('post', main, '/api/clients', { firstName })).body.id as string;
  const newOrder = async (clientId: string, body: object, cookie = main) =>
    (await send('post', cookie, '/api/service-orders', { clientId, ...body }))
      .body.id as string;
  const pay = (orderId: string, body: object, cookie = main) =>
    send('post', cookie, `/api/service-orders/${orderId}/payments`, body);
  const credit = async (clientId: string, cookie = main) =>
    (await get(cookie, `/api/clients/${clientId}/credit`)).body as {
      storeName: string;
      balance: string;
    }[];
  /** A client with 30 € kept as credit from an order that was paid. */
  const clientWithCredit = async (name: string) => {
    const clientId = await newClient(name);
    const orderId = await newOrder(clientId, {
      totalPrice: 80,
      amountPaid: 80,
    });
    const res = await pay(orderId, {
      kind: 'refund',
      amount: 30,
      method: 'credit',
      note: 'Funda no disponible, queda a cuenta',
    });
    expect(res.status).toBe(201);
    return { clientId, orderId };
  };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
  });
  afterAll(() => t.close());

  it('a refund to credit keeps the money for the next order', async () => {
    const { clientId, orderId } = await clientWithCredit('Lucía');
    expect(await credit(clientId)).toEqual([
      expect.objectContaining({ balance: '30.00' }),
    ]);
    const first = (await get(main, `/api/service-orders/${orderId}`)).body;
    expect(first).toMatchObject({ amountPaid: '50.00', balance: '30.00' });

    const next = await newOrder(clientId, { totalPrice: 45 });
    const tooMuch = await pay(next, {
      kind: 'charge',
      amount: 40,
      method: 'credit',
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toBe(
      'Saldo a favor insuficiente: tiene 30,00 €',
    );

    expect(
      (await pay(next, { kind: 'charge', amount: 30, method: 'credit' }))
        .status,
    ).toBe(201);
    expect(
      (await pay(next, { kind: 'charge', amount: 15, method: 'cash' })).status,
    ).toBe(201);
    expect(await credit(clientId)).toEqual([]);
    expect((await get(main, `/api/service-orders/${next}`)).body).toMatchObject(
      { amountPaid: '45.00', paymentStatus: 'paid' },
    );

    const none = await pay(await newOrder(clientId, { totalPrice: 10 }), {
      kind: 'charge',
      amount: 5,
      method: 'credit',
    });
    expect(none.body.message).toBe(
      'El cliente no tiene saldo a favor en esta tienda',
    );
  });

  it('two orders paid at once never spend more credit than there is', async () => {
    const { clientId } = await clientWithCredit('Marta');
    const orders = await Promise.all(
      [1, 2, 3].map(() => newOrder(clientId, { totalPrice: 20 })),
    );
    const results = await Promise.all(
      orders.map((id) =>
        pay(id, { kind: 'charge', amount: 20, method: 'credit' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await credit(clientId)).toEqual([
      expect.objectContaining({ balance: '10.00' }),
    ]);
  });

  it('a store only sees and spends the credit it holds', async () => {
    const { clientId } = await clientWithCredit('Pedro');
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

    expect((await get(vc, `/api/clients/${clientId}/credit`)).status).toBe(404);
    const vcOrder = await newOrder(clientId, { totalPrice: 20 }, vc);
    expect(await credit(clientId, vc)).toEqual([]);
    const res = await pay(
      vcOrder,
      { kind: 'charge', amount: 20, method: 'credit' },
      vc,
    );
    expect(res.status).toBe(400);

    expect(await credit(clientId, sa)).toEqual([
      expect.objectContaining({
        storeName: expect.any(String),
        balance: '30.00',
      }),
    ]);
  });

  it('credit blocks moving its order to another client and anonymizing', async () => {
    const { clientId, orderId } = await clientWithCredit('Ana');
    const other = await newClient('Otra');
    const move = await send('patch', main, `/api/service-orders/${orderId}`, {
      clientId: other,
    });
    expect(move.status).toBe(400);
    expect(move.body.message).toMatch(/saldo a favor/);

    await send('patch', main, `/api/service-orders/${orderId}`, {
      status: 'entregado',
    });
    const anon = await send('post', sa, `/api/clients/${clientId}/anonymize`);
    expect(anon.status).toBe(400);
    expect(anon.body.message).toBe(
      'Tiene saldo a favor: devuélveselo antes de anonimizar',
    );
  });

  it('the order screens cannot set "credit" as the order payment method', async () => {
    const id = await newOrder(await newClient('Luis'), { totalPrice: 10 });
    const res = await send('patch', main, `/api/service-orders/${id}`, {
      paymentMethod: 'credit',
    });
    expect(res.status).toBe(400);
  });

  it('charges minus refunds still equal what each order has paid', async () => {
    const mismatches = await t.db.query(`
      SELECT o.id FROM service_orders o
        LEFT JOIN (SELECT "orderId",
                          sum(CASE kind WHEN 'charge' THEN amount ELSE -amount END) AS net
                     FROM order_payments GROUP BY "orderId") p ON p."orderId" = o.id
       WHERE coalesce(p.net, 0) <> coalesce(o."amountPaid", 0)`);
    expect(mismatches).toEqual([]);
  });
});
