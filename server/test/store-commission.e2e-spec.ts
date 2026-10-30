import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Commission of each partner store', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcId: string;
  let mainId: string;
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
  const patchStore = (id: string, body: object) =>
    send('patch', sa, `/api/stores/${id}`, body);
  const order = async (id: string) =>
    (await get(sa, `/api/service-orders/${id}`)).body as {
      commissionType: string | null;
      commissionValue: string | null;
      commissionAmount: string | null;
    };
  /** An order of the partner store, paid and delivered. */
  const delivered = async (paid: number, extra: object = {}) => {
    const id = (
      await send('post', vc, '/api/service-orders', {
        clientId,
        totalPrice: paid,
        amountPaid: paid,
        ...extra,
      })
    ).body.id as string;
    const res = await send('patch', vc, `/api/service-orders/${id}`, {
      status: 'entregado',
    });
    expect(res.status).toBe(200);
    return id;
  };

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    [{ id: mainId }] = await t.db.query(`SELECT id FROM stores WHERE "isMain"`);
    vcId = (
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
      storeId: vcId,
    });
    // Skip the forced change of the temporary password.
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = 'vc@kenova.test'`,
    );
    vc = await t.login('vc@kenova.test');
    clientId = (await send('post', vc, '/api/clients', { firstName: 'Iker' }))
      .body.id;
  });
  afterAll(() => t.close());

  it('sets a commission and keeps its history', async () => {
    const res = await patchStore(vcId, {
      commissionType: 'percent',
      commissionValue: 15,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      commissionType: 'percent',
      commissionValue: '15.00',
    });
    // Saving the same commission again adds nothing to the history.
    await patchStore(vcId, { commissionType: 'percent', commissionValue: 15 });

    const history = await get(sa, `/api/stores/${vcId}/commission-history`);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      type: 'percent',
      value: '15.00',
      changedBy: { id: t.superAdmin.id, fullName: expect.any(String) },
    });
    expect(history.body[0].changedBy.email).toBeUndefined();
  });

  it('rejects an incomplete or impossible commission', async () => {
    const main = await patchStore(mainId, {
      commissionType: 'fixed',
      commissionValue: 10,
    });
    expect(main.status).toBe(400);
    expect(main.body.message).toBe('La tienda principal no lleva comisión');

    const half = await patchStore(vcId, { commissionType: 'fixed' });
    expect(half.status).toBe(400);
    expect(half.body.message).toBe('Indica el tipo y el valor de la comisión');

    const over = await patchStore(vcId, {
      commissionType: 'percent',
      commissionValue: 120,
    });
    expect(over.status).toBe(400);
    expect(over.body.message).toBe('El porcentaje no puede pasar de 100');

    expect(
      (await patchStore(vcId, { commissionType: 'other', commissionValue: 5 }))
        .status,
    ).toBe(400);
    expect(
      (await patchStore(vcId, { commissionType: 'fixed', commissionValue: -1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await send('patch', vc, `/api/stores/${vcId}`, {
          commissionType: 'percent',
          commissionValue: 50,
        })
      ).status,
    ).toBe(403);
  });

  it('freezes the commission when the order is delivered', async () => {
    const id = await delivered(129);
    expect(await order(id)).toMatchObject({
      commissionType: 'percent',
      commissionValue: '15.00',
      commissionAmount: '19.35',
    });

    await patchStore(vcId, { commissionType: 'fixed', commissionValue: 12 });
    expect((await order(id)).commissionAmount).toBe('19.35');
    const fixed = await delivered(200);
    expect(await order(fixed)).toMatchObject({
      commissionType: 'fixed',
      commissionValue: '12.00',
      commissionAmount: '12.00',
    });
  });

  it('reopening the order drops its commission', async () => {
    const id = await delivered(50);
    const res = await send('patch', sa, `/api/service-orders/${id}`, {
      status: 'finalizado',
    });
    expect(res.status).toBe(200);
    expect(await order(id)).toMatchObject({
      commissionType: null,
      commissionValue: null,
      commissionAmount: null,
    });
  });

  it('a warranty claim earns no commission', async () => {
    const original = await delivered(80);
    const claim = await delivered(0, { warrantyOfId: original });
    expect(await order(claim)).toMatchObject({
      commissionType: 'fixed',
      commissionAmount: '0.00',
    });
  });

  it('workshop orders never carry a commission', async () => {
    const mainClient = (
      await send('post', sa, '/api/clients', { firstName: 'Ana' })
    ).body.id;
    const id = (
      await send('post', sa, '/api/service-orders', {
        clientId: mainClient,
        totalPrice: 100,
        amountPaid: 100,
      })
    ).body.id;
    await send('patch', sa, `/api/service-orders/${id}`, {
      status: 'entregado',
    });
    expect((await order(id)).commissionAmount).toBeNull();
  });

  it('removing the commission is recorded and a store sees only its own history', async () => {
    const off = await patchStore(vcId, {
      commissionType: null,
      commissionValue: null,
    });
    expect(off.body).toMatchObject({
      commissionType: null,
      commissionValue: null,
    });
    const own = await get(vc, `/api/stores/${vcId}/commission-history`);
    expect(own.status).toBe(200);
    expect(own.body.map((r: { type: string | null }) => r.type)).toEqual([
      null,
      'fixed',
      'percent',
    ]);
    expect(
      (await get(vc, `/api/stores/${mainId}/commission-history`)).status,
    ).toBe(404);
  });
});
