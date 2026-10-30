import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Order outcome and warranty claims', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let clientId: string;

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
  const newOrder = async (body: object = {}, cookie = main) =>
    send('post', cookie, '/api/service-orders', { clientId, ...body });
  const patch = (id: string, body: object) =>
    send('patch', main, `/api/service-orders/${id}`, body);
  const delivered = async () => {
    const id = (await newOrder()).body.id as string;
    await patch(id, { status: 'entregado' });
    return id;
  };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
    clientId = (await send('post', sa, '/api/clients', { firstName: 'Lucía' }))
      .body.id;
  });
  afterAll(() => t.close());

  it('records the work done, the checks and the result when finishing', async () => {
    const id = (await newOrder()).body.id;
    const res = await patch(id, {
      status: 'finalizado',
      workDone: '  Sustituida pantalla OLED. ',
      testsDone: ['touch', 'biometrics'],
      result: 'repaired',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      workDone: 'Sustituida pantalla OLED.',
      testsDone: ['touch', 'biometrics'],
      result: 'repaired',
      notRepairedReason: null,
    });
    expect((await patch(id, { testsDone: ['smell'] })).status).toBe(400);
  });

  it('only a finished order has a result, and "not repaired" needs a reason', async () => {
    const id = (await newOrder()).body.id;
    const early = await patch(id, { result: 'repaired' });
    expect(early.status).toBe(400);
    expect(early.body.message).toBe(
      'Solo una orden finalizada o entregada tiene resultado',
    );

    const noReason = await patch(id, {
      status: 'finalizado',
      result: 'not_repaired',
    });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toBe('Indica por qué no se repara');

    const ok = await patch(id, {
      status: 'finalizado',
      result: 'not_repaired',
      notRepairedReason: 'Placa dañada por líquido',
      workDone: 'Diagnóstico',
    });
    expect(ok.body).toMatchObject({
      result: 'not_repaired',
      notRepairedReason: 'Placa dañada por líquido',
    });

    // Reopening clears the outcome but keeps the work already written.
    const reopened = await patch(id, { status: 'en_progreso' });
    expect(reopened.body).toMatchObject({
      result: null,
      notRepairedReason: null,
      workDone: 'Diagnóstico',
    });
  });

  it('opens a warranty claim of a delivered order', async () => {
    const original = await delivered();
    const claim = await newOrder({ warrantyOfId: original });
    expect(claim.status).toBe(201);
    expect(claim.body.warrantyOfId).toBe(original);

    const pending = (await newOrder()).body.id;
    const notYet = await newOrder({ warrantyOfId: pending });
    expect(notYet.status).toBe(400);
    expect(notYet.body.message).toMatch(/aún no se ha entregado/);
  });

  it('after 90 days only the workshop admins can open a warranty', async () => {
    const original = await delivered();
    await t.db.query(
      `UPDATE service_orders SET "deliveredAt" = now() - interval '140 days' WHERE id = $1`,
      [original],
    );
    const store = await newOrder({ warrantyOfId: original });
    expect(store.status).toBe(400);
    expect(store.body.message).toMatch(
      /^Este equipo se entregó hace 140 días \(MP-\d{4}\)\. El plazo de garantía es de 90 días\.$/,
    );
    expect((await newOrder({ warrantyOfId: original }, sa)).status).toBe(201);
  });

  it('refuses a warranty of an order in the trash', async () => {
    const original = await delivered();
    await send('delete', sa, `/api/service-orders/${original}`);
    const res = await newOrder({ warrantyOfId: original });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/está en la Papelera/);
  });

  it('"garantía no procede" only applies to a warranty claim', async () => {
    const normal = (await newOrder()).body.id;
    expect(
      (await patch(normal, { warrantyRejectedReason: 'Golpe' })).status,
    ).toBe(400);

    const claim = (await newOrder({ warrantyOfId: await delivered() })).body.id;
    const res = await patch(claim, {
      warrantyRejectedReason: 'Golpe en la pantalla nueva',
    });
    expect(res.status).toBe(200);
    expect(res.body.warrantyRejectedReason).toBe('Golpe en la pantalla nueva');
  });
});
