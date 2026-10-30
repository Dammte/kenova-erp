import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Client anonymization (RGPD)', () => {
  let t: TestContext;
  let sa: string;
  let main: string;

  const send = (
    method: 'post' | 'put' | 'patch',
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
  const anonymize = (id: string, cookie = sa) =>
    send('post', cookie, `/api/clients/${id}/anonymize`);

  /** A client with a delivered, paid order on a device with a PIN. */
  const clientWithHistory = async (dni: string) => {
    const clientId = (
      await send('post', main, '/api/clients', {
        firstName: 'lucía',
        lastName: 'gómez',
        dni,
        email: `${dni}@correo.test`,
        phoneNumber: '600111222',
        address: 'Calle Mayor 1',
        postalCode: '09500',
        city: 'Medina de Pomar',
        observations: 'Prefiere WhatsApp',
      })
    ).body.id as string;
    const deviceId = (
      await send('post', main, '/api/devices', {
        imei: `35${dni.slice(0, 8)}12345`,
        type: 'smartphone',
        brand: 'Apple',
        model: 'iPhone 13',
        code: '1234',
        clientId,
      })
    ).body.id as string;
    const orderId = (
      await send('post', main, '/api/service-orders', {
        clientId,
        deviceId,
        totalPrice: 120,
        amountPaid: 120,
      })
    ).body.id as string;
    await send('patch', main, `/api/service-orders/${orderId}`, {
      status: 'entregado',
    });
    return { clientId, deviceId, orderId };
  };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
  });
  afterAll(() => t.close());

  it('removes the personal data and keeps orders, payments and the IMEI', async () => {
    const { clientId, deviceId, orderId } =
      await clientWithHistory('11111111H');

    const res = await anonymize(clientId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'Cliente anonimizado',
      lastName: null,
      dni: null,
      email: null,
      phoneNumber: null,
      address: null,
      postalCode: null,
      city: null,
      observations: null,
      isActive: false,
    });
    expect(res.body.anonymizedAt).toEqual(expect.any(String));

    const order = (await get(sa, `/api/service-orders/${orderId}`)).body;
    expect(order).toMatchObject({ clientId, amountPaid: '120.00' });
    const payments = (await get(sa, `/api/service-orders/${orderId}/payments`))
      .body;
    expect(payments).toHaveLength(1);

    const [device] = await t.db.query(
      `SELECT imei, "unlockSecretCiphertext" c, "unlockSecretType" k
         FROM devices WHERE id = $1`,
      [deviceId],
    );
    expect(device).toEqual({ imei: '351111111112345', c: null, k: null });

    const [audit] = await t.db.query(
      `SELECT "actorUserId", metadata FROM audit_events
        WHERE action = 'CLIENT_ANONYMIZED' AND "entityId" = $1`,
      [clientId],
    );
    expect(audit).toEqual({ actorUserId: t.superAdmin.id, metadata: null });
  });

  it('the old data no longer finds the client', async () => {
    const { clientId } = await clientWithHistory('22222222J');
    await anonymize(clientId);
    for (const url of [
      '/api/clients/search?dni=22222222J',
      '/api/clients/search?q=600111222',
      '/api/clients/search?q=22222222J',
    ]) {
      const found = (await get(sa, url)).body as { id: string }[];
      expect(found.map((c) => c.id)).not.toContain(clientId);
    }
  });

  it('an anonymized client cannot be edited, anonymized again or get new orders', async () => {
    const { clientId } = await clientWithHistory('33333333P');
    await anonymize(clientId);

    const edit = await send('put', sa, `/api/clients/${clientId}`, {
      firstName: 'Lucía',
    });
    expect(edit.status).toBe(400);
    expect(edit.body.message).toMatch(/anonimizado/);
    expect((await anonymize(clientId)).status).toBe(400);

    const order = await send('post', main, '/api/service-orders', {
      clientId,
    });
    expect(order.status).toBe(400);
    expect(order.body.message).toMatch(/anonimizado/);

    const other = (
      await send('post', main, '/api/clients', { firstName: 'Otro' })
    ).body.id;
    const otherOrder = (
      await send('post', main, '/api/service-orders', { clientId: other })
    ).body.id;
    const move = await send(
      'patch',
      main,
      `/api/service-orders/${otherOrder}`,
      {
        clientId,
      },
    );
    expect(move.status).toBe(400);
  });

  it('waits until every order of the client is closed', async () => {
    const clientId = (
      await send('post', main, '/api/clients', { firstName: 'Pendiente' })
    ).body.id;
    const orderId = (
      await send('post', main, '/api/service-orders', { clientId })
    ).body.id;
    const res = await anonymize(clientId);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'Tiene 1 orden(es) sin entregar o cancelar: ciérralas antes de anonimizar',
    );

    await send('patch', main, `/api/service-orders/${orderId}`, {
      status: 'cancelado',
      cancelReason: 'No vino a recogerlo',
    });
    expect((await anonymize(clientId)).status).toBe(200);
  });

  it('only the workshop admins can anonymize', async () => {
    const { clientId } = await clientWithHistory('44444444A');
    expect((await anonymize(clientId, main)).status).toBe(403);
    const [row] = await t.db.query(
      `SELECT "anonymizedAt" FROM client WHERE id = $1`,
      [clientId],
    );
    expect(row.anonymizedAt).toBeNull();
  });
});
