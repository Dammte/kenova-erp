import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Shipments between partner stores and the workshop', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let vc: string;
  let vcStoreId: string;
  let clientId: string;

  const send = (cookie: string, url: string, body: object = {}) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const get = (cookie: string, url: string) =>
    t.http().get(url).set('Cookie', cookie);
  const newOrder = async (cookie: string) =>
    (await send(cookie, '/api/service-orders', { clientId })).body as {
      id: string;
      code: string;
      location: string | null;
    };
  const location = async (id: string) =>
    (await get(sa, `/api/service-orders/${id}`)).body.location as string | null;

  /** A partner store with its own account, signed in. */
  const partnerStore = async (name: string, prefix: string) => {
    const store = (await send(sa, '/api/stores', { name, city: name, prefix }))
      .body;
    const email = `${prefix.toLowerCase()}@kenova.test`;
    await send(sa, '/api/users', {
      username: name.toLowerCase(),
      fullName: `Tienda ${name}`,
      email,
      temporaryPassword: PASSWORD,
      storeId: store.id,
    });
    // Skip the forced change of the temporary password.
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = $1`,
      [email],
    );
    return { storeId: store.id as string, cookie: await t.login(email) };
  };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
    ({ storeId: vcStoreId, cookie: vc } = await partnerStore(
      'Villarcayo',
      'VC',
    ));
    clientId = (await send(vc, '/api/clients', { firstName: 'Iker' })).body.id;
  });
  afterAll(() => t.close());

  it('a device taken in at a partner store starts at the store', async () => {
    expect((await newOrder(vc)).location).toBe('at_store');
    expect((await newOrder(sa)).location).toBeNull();
  });

  it('a partner store ships its devices to the workshop', async () => {
    const a = await newOrder(vc);
    const b = await newOrder(vc);
    expect(
      (await send(vc, '/api/shipments', { orderIds: [] })).body.message,
    ).toContain('Añade al menos un equipo');

    const res = await send(vc, '/api/shipments', {
      orderIds: [a.id, b.id, a.id],
      carrier: ' Transportes Merindades ',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      code: expect.stringMatching(/^ENV-\d{4}$/),
      status: 'sent',
      fromStore: { id: vcStoreId, name: 'Villarcayo' },
      toStore: { name: expect.any(String) },
      carrier: 'Transportes Merindades',
      deviceCount: 2,
    });
    expect(
      res.body.lines.map((l: { orderCode: string }) => l.orderCode),
    ).toEqual([a.code, b.code].sort());
    expect(await location(a.id)).toBe('to_workshop');

    const again = await send(vc, '/api/shipments', { orderIds: [a.id] });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe(
      `No se pueden enviar: ${a.code} (Enviado a Medina)`,
    );
  });

  it("a store cannot ship or see another store's orders and shipments", async () => {
    const medina = await newOrder(sa);
    expect(
      (await send(vc, '/api/shipments', { orderIds: [medina.id] })).status,
    ).toBe(404);

    const { cookie: other } = await partnerStore('Espinosa', 'ES');
    const shipment = (
      await send(vc, '/api/shipments', { orderIds: [(await newOrder(vc)).id] })
    ).body;
    expect((await get(other, `/api/shipments/${shipment.id}`)).status).toBe(
      404,
    );
    expect((await get(other, '/api/shipments')).body).toEqual({
      items: [],
      total: 0,
    });
    const mine = (await get(vc, '/api/shipments')).body;
    expect(mine.items.map((s: { id: string }) => s.id)).toContain(shipment.id);
    expect((await get(sa, `/api/shipments/${shipment.id}`)).status).toBe(200);
  });

  it('the workshop sends repaired devices back to their store', async () => {
    const order = await newOrder(vc);
    await send(vc, '/api/shipments', { orderIds: [order.id] });
    // Receiving at the workshop comes in the next step; place it there.
    await t.db.query(
      `UPDATE service_orders SET location = 'at_workshop' WHERE id = $1`,
      [order.id],
    );

    expect(
      (await send(sa, '/api/shipments', { orderIds: [order.id] })).body.message,
    ).toBe('Elige la tienda a la que vuelve');
    expect(
      (await send(main, '/api/shipments', { orderIds: [order.id] })).body
        .message,
    ).toBe('Los envíos desde Medina los crea un socio');

    const back = await send(sa, '/api/shipments', {
      orderIds: [order.id],
      toStoreId: vcStoreId,
    });
    expect(back.status).toBe(201);
    expect(back.body.toStore).toEqual({ id: vcStoreId, name: 'Villarcayo' });
    expect(await location(order.id)).toBe('to_store');
  });

  it('cancelled or delivered orders never travel', async () => {
    const order = await newOrder(vc);
    await t
      .http()
      .patch(`/api/service-orders/${order.id}`)
      .set('Cookie', vc)
      .set('Origin', ORIGIN)
      .send({ status: 'cancelado', cancelReason: 'No lo quiere' });
    const res = await send(vc, '/api/shipments', { orderIds: [order.id] });
    expect(res.body.message).toBe(
      `No se pueden enviar: ${order.code} (cancelada)`,
    );
  });

  it('lists 30 per page, newest first, filtered by status', async () => {
    const page = (await get(sa, '/api/shipments?status=sent')).body;
    expect(page.total).toBeGreaterThanOrEqual(3);
    const dates = page.items.map((s: { createdAt: string }) => s.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect((await get(sa, '/api/shipments?status=received')).body.total).toBe(
      0,
    );
    expect((await get(sa, '/api/shipments?status=lost')).status).toBe(400);
  });
});
