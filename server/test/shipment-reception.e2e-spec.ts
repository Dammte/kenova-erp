import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Receiving shipments with the scanner', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcStoreId: string;
  let mainName: string;
  let clientId: string;

  const send = (cookie: string, url: string, body: object = {}) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const patch = (cookie: string, url: string, body: object) =>
    t.http().patch(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const get = (cookie: string, url: string) =>
    t.http().get(url).set('Cookie', cookie);
  const newOrder = async (cookie = vc) =>
    (await send(cookie, '/api/service-orders', { clientId })).body as {
      id: string;
      code: string;
    };
  const ship = async (orderIds: string[], cookie = vc, body: object = {}) =>
    (await send(cookie, '/api/shipments', { orderIds, ...body })).body as {
      id: string;
      code: string;
    };
  const scan = (shipmentId: string, code: string, cookie = sa) =>
    send(cookie, `/api/shipments/${shipmentId}/scan`, { code });
  const location = async (id: string) =>
    (await get(sa, `/api/service-orders/${id}`)).body.location as string;

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
    ({ storeId: vcStoreId, cookie: vc } = await partnerStore(
      'Villarcayo',
      'VC',
    ));
    [{ name: mainName }] = await t.db.query(
      `SELECT name FROM stores WHERE "isMain"`,
    );
    clientId = (await send(vc, '/api/clients', { firstName: 'Sonia' })).body.id;
  });
  afterAll(() => t.close());

  it('the workshop confirms each device as it scans it, then closes', async () => {
    const a = await newOrder();
    const b = await newOrder();
    const shipment = await ship([a.id, b.id]);

    const sender = await scan(shipment.id, a.code, vc);
    expect(sender.status).toBe(403);
    expect(sender.body.message).toBe(`Este envío lo recibe ${mainName}`);

    const first = await scan(shipment.id, ` ${a.code.toLowerCase()} `);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      result: 'received',
      message: `${a.code} recibido`,
      orderCode: a.code,
      received: 1,
      total: 2,
    });
    expect(await location(a.id)).toBe('at_workshop');
    expect((await scan(shipment.id, a.code)).body.result).toBe('already');

    const closed = await send(sa, `/api/shipments/${shipment.id}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('received_incomplete');
    expect(
      closed.body.lines.find((l: { orderId: string }) => l.orderId === b.id),
    ).toMatchObject({ notArrived: true, receivedAt: null });
    expect(await location(b.id)).toBe('to_workshop');

    const late = await scan(shipment.id, b.code);
    expect(late.status).toBe(400);
    expect(late.body.message).toBe('Este envío ya está recibido');
  });

  it('a device missing from a shipment is confirmed when it turns up later', async () => {
    const lost = await newOrder();
    const first = await ship([lost.id]);
    await send(sa, `/api/shipments/${first.id}/close`);

    const second = await ship([(await newOrder()).id]);
    const res = await scan(second.id, lost.code);
    expect(res.body).toMatchObject({
      result: 'late',
      message: `${lost.code} llegó del envío ${first.code}`,
      received: 0,
      total: 1,
    });
    expect(await location(lost.id)).toBe('at_workshop');
    expect((await get(sa, `/api/shipments/${first.id}`)).body.status).toBe(
      'received',
    );
  });

  it('a code from outside the shipment warns and changes nothing', async () => {
    const shipment = await ship([(await newOrder()).id]);
    const other = await newOrder();
    const foreign = await scan(shipment.id, other.code);
    expect(foreign.body).toMatchObject({
      result: 'foreign',
      message: `${other.code} no está en este envío. Es de Villarcayo y está En tienda (recepción).`,
    });
    expect(await location(other.id)).toBe('at_store');

    const medina = await newOrder(sa);
    expect((await scan(shipment.id, medina.code)).body.message).toBe(
      `${medina.code} no está en este envío. Es de ${mainName}.`,
    );
    expect((await scan(shipment.id, 'ZZ-9999')).body).toMatchObject({
      result: 'unknown',
      message: 'No hay ninguna orden ZZ-9999',
    });
  });

  it('the store receives the repaired device and only then hands it over', async () => {
    const order = await newOrder();
    const out = await ship([order.id]);
    await scan(out.id, order.code);
    await send(sa, `/api/shipments/${out.id}/close`);

    const early = await patch(vc, `/api/service-orders/${order.id}`, {
      status: 'entregado',
    });
    expect(early.status).toBe(400);
    expect(early.body.message).toBe(
      'El equipo aún no ha vuelto a la tienda (En Medina)',
    );

    const back = await ship([order.id], sa, { toStoreId: vcStoreId });
    expect((await scan(back.id, order.code, vc)).body.result).toBe('received');
    expect(await location(order.id)).toBe('ready_at_store');
    expect(
      (await send(vc, `/api/shipments/${back.id}/close`)).body.status,
    ).toBe('received');

    const delivered = await patch(vc, `/api/service-orders/${order.id}`, {
      status: 'entregado',
    });
    expect(delivered.status).toBe(200);
  });

  it('a device still at the store can be handed back without travelling', async () => {
    const order = await newOrder();
    const res = await patch(vc, `/api/service-orders/${order.id}`, {
      status: 'entregado',
    });
    expect(res.status).toBe(200);
  });

  it('another store cannot receive or even find the shipment', async () => {
    const { cookie: es } = await partnerStore('Espinosa', 'ES');
    const order = await newOrder();
    const shipment = await ship([order.id]);
    expect((await scan(shipment.id, order.code, es)).status).toBe(404);
    expect((await send(es, `/api/shipments/${shipment.id}/close`)).status).toBe(
      404,
    );
  });
});
