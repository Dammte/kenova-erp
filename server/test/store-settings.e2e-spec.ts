import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Store settings: printouts, till and warranty', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let mainId: string;

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
  const patchStore = (id: string, body: object, cookie = sa) =>
    send('patch', cookie, `/api/stores/${id}`, body);

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);
    [{ id: mainId }] = await t.db.query(`SELECT id FROM stores WHERE "isMain"`);
  });
  afterAll(() => t.close());

  it('a new store starts with the legal 90 days and default till hours', async () => {
    const res = await send('post', sa, '/api/stores', {
      name: 'Villarcayo',
      city: 'Villarcayo',
      prefix: 'VC',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      legalName: null,
      taxId: null,
      cashOpensAt: '09:00:00',
      cashClosesAt: '20:00:00',
      cashFloat: '0.00',
      warrantyDays: 90,
    });
  });

  it('saves the settings and rejects impossible ones', async () => {
    const ok = await patchStore(mainId, {
      legalName: ' Kenova Reparaciones SL ',
      taxId: 'b12345674',
      cashOpensAt: '09:30',
      cashClosesAt: '20:30',
      cashFloat: 100,
      warrantyDays: 120,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      legalName: 'Kenova Reparaciones SL',
      taxId: 'B12345674',
      cashOpensAt: '09:30:00',
      cashClosesAt: '20:30:00',
      cashFloat: '100.00',
      warrantyDays: 120,
    });

    const short = await patchStore(mainId, { warrantyDays: 60 });
    expect(short.status).toBe(400);
    expect(short.body.message).toContain(
      'La garantía no puede ser inferior a 90 días',
    );
    const hours = await patchStore(mainId, { cashClosesAt: '09:00' });
    expect(hours.status).toBe(400);
    expect(hours.body.message).toBe(
      'La hora de cierre debe ser posterior a la de apertura.',
    );
    expect((await patchStore(mainId, { cashOpensAt: '25:00' })).status).toBe(
      400,
    );
    expect((await patchStore(mainId, { cashFloat: -1 })).status).toBe(400);
    expect((await patchStore(mainId, { warrantyDays: 200 }, main)).status).toBe(
      403,
    );
  });

  it('the prefix only changes while the store has no orders', async () => {
    const store = (
      await send('post', sa, '/api/stores', {
        name: 'Espinosa',
        city: 'Espinosa de los Monteros',
        prefix: 'ESP',
      })
    ).body;
    expect((await patchStore(store.id, { prefix: 'VC' })).status).toBe(409);
    const renamed = await patchStore(store.id, { prefix: 'es' });
    expect(renamed.body.prefix).toBe('ES');

    const [{ prefix }] = await t.db.query(
      `SELECT prefix FROM stores WHERE id = $1`,
      [mainId],
    );
    const clientId = (
      await send('post', main, '/api/clients', { firstName: 'Ana' })
    ).body.id;
    await send('post', main, '/api/service-orders', { clientId });
    const res = await patchStore(mainId, { prefix: 'MD' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(
      new RegExp(
        `^El prefijo no se puede cambiar: ya hay \\d+ órdenes con ${prefix}-$`,
      ),
    );
  });

  it("warranty claims follow the delivering store's warranty days", async () => {
    await patchStore(mainId, { warrantyDays: 180 });
    const clientId = (
      await send('post', main, '/api/clients', { firstName: 'Iker' })
    ).body.id;
    const original = (
      await send('post', main, '/api/service-orders', { clientId })
    ).body.id;
    await send('patch', main, `/api/service-orders/${original}`, {
      status: 'entregado',
    });
    await t.db.query(
      `UPDATE service_orders SET "deliveredAt" = now() - interval '140 days' WHERE id = $1`,
      [original],
    );
    const claim = await send('post', main, '/api/service-orders', {
      clientId,
      warrantyOfId: original,
    });
    expect(claim.status).toBe(201);

    await patchStore(mainId, { warrantyDays: 120 });
    const late = await send('post', main, '/api/service-orders', {
      clientId,
      warrantyOfId: original,
    });
    expect(late.status).toBe(400);
    expect(late.body.message).toMatch(/El plazo de garantía es de 120 días\.$/);
  });
});
