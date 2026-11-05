import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Quote {
  id: string;
  status: string;
  clientId: string | null;
  deviceId: string | null;
  order: { id: string; code: string } | null;
}
interface Order {
  id: string;
  status: string;
  totalPrice: string | number;
  result: string | null;
  notRepairedReason: string | null;
  clientId: string;
  deviceId: string | null;
  services?: { id: string }[];
  quote: { id: string; code: string; status: string } | null;
}

/** Design 2.4: a quote for a device already in the workshop. */
describe('Quote made from an order', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let board: string;

  const send = (
    method: 'post' | 'patch' | 'delete',
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
  const order = async (id: string) =>
    (await t.http().get(`/api/service-orders/${id}`).set('Cookie', sa))
      .body as Order;
  let phone = 655000000;
  const intake = async (cookie = sa) => {
    phone += 1;
    const res = await send('post', cookie, '/api/service-orders/intake', {
      client: { firstName: 'Aitor', phoneNumber: String(phone) },
      device: { type: 'movil', brand: 'Apple', model: 'MacBook Air M1' },
      order: {
        status: 'en_progreso',
        reportedFaults: ['liquid_damage'],
        totalPrice: 20,
      },
    });
    expect(res.status).toBe(201);
    return (res.body as { id: string }).id;
  };
  const quoteFor = (orderId: string, cookie = sa) =>
    send('post', cookie, '/api/quotes', {
      orderId,
      clientName: 'Aitor',
      clientPhone: String(phone),
      brand: 'Apple',
      model: 'MacBook Air M1',
      fault: 'Daño por líquido',
      diagnosticFee: 25,
      lines: [
        { serviceId: board, description: 'Placa base', unitPrice: 380 },
        { description: 'Limpieza por líquido', unitPrice: 35.5 },
      ],
    });

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
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
    vc = await t.login('vc@kenova.test');
    board = (
      (
        await send('post', sa, '/api/services', {
          name: 'Placa base MacBook Air M1',
          description: '',
          price: 360,
          available: true,
        })
      ).body as { id: string }
    ).id;
  });
  afterAll(() => t.close());

  it('takes the order’s client and device and puts the order on hold', async () => {
    const id = await intake();
    expect((await order(id)).quote).toBeNull();
    const res = await quoteFor(id);
    expect(res.status).toBe(201);
    const quote = res.body as Quote;
    const o = await order(id);
    expect(quote).toMatchObject({
      status: 'draft',
      clientId: o.clientId,
      deviceId: o.deviceId,
      order: { id },
    });
    expect(o.status).toBe('pendiente_cliente');
    expect(o.quote).toMatchObject({ id: quote.id, status: 'draft' });
    expect((await quoteFor(id)).status).toBe(409); // one quote per order
  });

  it('on acceptance sends the order back to work at the quoted price', async () => {
    const id = await intake();
    const quote = (await quoteFor(id)).body as Quote;
    const res = await send('post', sa, `/api/quotes/${quote.id}/accept`);
    expect(res.status).toBe(200);
    expect((res.body as Quote).status).toBe('accepted');
    const o = await order(id);
    expect(o.status).toBe('en_progreso');
    expect(Number(o.totalPrice)).toBe(415.5);
    expect(o.services?.map((s) => s.id)).toEqual([board]);
    const lines = await t.db.query<
      { description: string; unitPrice: string }[]
    >(
      `SELECT description, "unitPrice" FROM order_lines WHERE "orderId" = $1 ORDER BY position`,
      [id],
    );
    expect(lines.reduce((s, l) => s + Number(l.unitPrice), 0)).toBe(415.5);
    // Answered once: a second click does nothing.
    expect(
      (await send('post', sa, `/api/quotes/${quote.id}/accept`)).status,
    ).toBe(409);
  });

  it('on rejection returns the device unrepaired, charging only the diagnostic', async () => {
    const id = await intake();
    const quote = (await quoteFor(id)).body as Quote;
    const res = await send('post', sa, `/api/quotes/${quote.id}/reject`);
    expect(res.status).toBe(200);
    const o = await order(id);
    expect(o).toMatchObject({
      status: 'finalizado',
      result: 'not_repaired',
      notRepairedReason: 'El cliente no aceptó el presupuesto',
    });
    expect(Number(o.totalPrice)).toBe(25);
  });

  it('is not turned into a second order at intake, nor accepted once expired', async () => {
    const id = await intake();
    const quote = (await quoteFor(id)).body as Quote;
    const res = await send('post', sa, '/api/service-orders/intake', {
      quoteId: quote.id,
      client: { firstName: 'Aitor', phoneNumber: '699111222' },
      device: { type: 'movil', brand: 'Apple', model: 'MacBook Air M1' },
      order: { status: 'en_progreso', reportedFaults: ['liquid_damage'] },
    });
    expect(res.status).toBe(409);
    await t.db.query(
      `UPDATE quotes SET "validUntil" = current_date - 2 WHERE id = $1`,
      [quote.id],
    );
    expect(
      (await send('post', sa, `/api/quotes/${quote.id}/accept`)).status,
    ).toBe(409);
    expect((await order(id)).status).toBe('pendiente_cliente');
  });

  it('puts the order back to work when its open quote is deleted', async () => {
    const id = await intake();
    const quote = (await quoteFor(id)).body as Quote;
    expect((await send('delete', sa, `/api/quotes/${quote.id}`)).status).toBe(
      204,
    );
    expect((await order(id)).status).toBe('en_progreso');
  });

  it('refuses closed orders, other stores’ orders and accepting a walk-in quote', async () => {
    const closed = await intake();
    await t.db.query(
      `UPDATE service_orders SET status = 'cancelado' WHERE id = $1`,
      [closed],
    );
    expect((await quoteFor(closed)).status).toBe(409);
    expect((await quoteFor(await intake(), vc)).status).toBe(404);

    const walkIn = await send('post', sa, '/api/quotes', {
      clientName: 'Lucía',
      clientPhone: '611 222 333',
      model: 'iPhone 13',
      lines: [{ description: 'Pantalla', unitPrice: 120 }],
    });
    const quoteId = (walkIn.body as Quote).id;
    expect(
      (await send('post', sa, `/api/quotes/${quoteId}/accept`)).status,
    ).toBe(409);
  });
});
