import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('What the customer reports and leaves at intake', () => {
  let t: TestContext;
  let cookie: string;
  let clientId: string;

  const send = (method: 'post' | 'patch', url: string, body: object) =>
    t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    clientId = (await send('post', '/api/clients', { firstName: 'Iker' })).body
      .id;
  });
  afterAll(() => t.close());

  it('stores faults, condition, accessories and the quote waiver', async () => {
    const res = await send('post', '/api/service-orders/intake', {
      clientId,
      device: { type: 'movil', brand: 'Apple', model: 'iPhone 12' },
      order: {
        reportedFaults: ['broken_screen', 'battery'],
        faultNotes: '  Se apaga al 30 % ',
        physicalCondition: 'Arañazos en la tapa',
        accessories: 'Funda, cargador',
        waivesQuote: true,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      reportedFaults: ['broken_screen', 'battery'],
      faultNotes: 'Se apaga al 30 %',
      physicalCondition: 'Arañazos en la tapa',
      accessories: 'Funda, cargador',
      waivesQuote: true,
    });
  });

  it('defaults to no faults and no waiver', async () => {
    const res = await send('post', '/api/service-orders', { clientId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ reportedFaults: [], waivesQuote: false });
  });

  it('takes the fault from the device when the screen still sends it there', async () => {
    const res = await send('post', '/api/service-orders/intake', {
      clientId,
      device: {
        type: 'movil',
        brand: 'Xiaomi',
        model: 'Redmi 9',
        status: 'liquid_damage',
      },
      order: {},
    });
    expect(res.body.reportedFaults).toEqual(['liquid_damage']);
  });

  it('rejects unknown or repeated faults', async () => {
    for (const reportedFaults of [
      ['rota'],
      ['battery', 'battery'],
      'battery',
    ]) {
      const res = await send('post', '/api/service-orders', {
        clientId,
        reportedFaults,
      });
      expect(res.status).toBe(400);
    }
    await expect(
      t.db.query(
        `UPDATE service_orders SET "reportedFaults" = ARRAY['rota'] WHERE "clientId" = $1`,
        [clientId],
      ),
    ).rejects.toThrow(/CHK_service_orders_reported_faults/);
  });

  it('can be corrected after intake', async () => {
    const o = (await send('post', '/api/service-orders', { clientId })).body;
    const res = await send('patch', `/api/service-orders/${o.id}`, {
      reportedFaults: ['other'],
      faultNotes: 'Altavoz',
      accessories: '',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      reportedFaults: ['other'],
      faultNotes: 'Altavoz',
      accessories: null,
    });
  });
});
