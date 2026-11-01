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

  it("adds up the month's delivered orders: collected, commission and what goes to Kenova", async () => {
    const res = await get(vc, `/api/stores/${vcId}/commissions`);
    expect(res.status).toBe(200);
    const month = res.body.month as string;
    expect(month).toMatch(/^\d{4}-\d{2}$/);
    // 129 € at 15 %, 200 € and 80 € at 12 € fixed, a warranty claim at 0;
    // the reopened order and the workshop's order do not count.
    expect(res.body).toMatchObject({
      store: { id: vcId, name: 'Villarcayo' },
      collected: '409.00',
      commission: '43.35',
      toKenova: '365.65',
    });
    expect(res.body.lines).toHaveLength(4);
    expect(res.body.lines[0]).toMatchObject({
      clientName: 'Iker',
      amountPaid: '129.00',
      commissionType: 'percent',
      commissionValue: '15.00',
      commissionAmount: '19.35',
      warranty: false,
    });
    expect(
      res.body.lines.filter((l: { warranty: boolean }) => l.warranty),
    ).toHaveLength(1);

    // An order delivered last month belongs to last month.
    const moved = res.body.lines[0].orderId as string;
    await t.db.query(
      `UPDATE service_orders SET "deliveredAt" = date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid' - interval '1 minute' WHERE id = $1`,
      [moved],
    );
    const [y, m] = month.split('-').map(Number);
    const previous =
      m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const before = (
      await get(sa, `/api/stores/${vcId}/commissions?month=${previous}`)
    ).body;
    expect(before.lines.map((l: { orderId: string }) => l.orderId)).toEqual([
      moved,
    ]);
    expect(before.commission).toBe('19.35');
    expect(
      (await get(sa, `/api/stores/${vcId}/commissions?month=${month}`)).body
        .commission,
    ).toBe('24.00');
  });

  it('only the store itself or a partner sees it, and the workshop has none', async () => {
    expect((await get(vc, `/api/stores/${mainId}/commissions`)).status).toBe(
      404,
    );
    const main = await get(sa, `/api/stores/${mainId}/commissions`);
    expect(main.status).toBe(400);
    expect(main.body.message).toBe('La tienda principal no lleva comisión');
    const bad = await get(sa, `/api/stores/${vcId}/commissions?month=2026-13`);
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('El mes debe tener la forma AAAA-MM');
  });

  it('settles a finished month in order and carries what was not handed over', async () => {
    const now = (await get(sa, `/api/stores/${vcId}/commissions`)).body;
    const [y, m] = (now.month as string).split('-').map(Number);
    const shift = (by: number) => {
      const d = new Date(Date.UTC(y, m - 1 + by, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const settle = (month: string, body: object, cookie = sa) =>
      send(
        'post',
        cookie,
        `/api/stores/${vcId}/commissions/${month}/settlement`,
        body,
      );
    const cash = { received: 100, receivedOn: '2026-10-02', method: 'cash' };

    const early = await settle(now.month, cash);
    expect(early.status).toBe(400);
    expect(early.body.message).toContain('El mes aún no ha terminado');
    expect((await settle(shift(-1), cash, vc)).status).toBe(403);
    expect((await settle(shift(-1), { ...cash, received: -1 })).status).toBe(
      400,
    );
    expect(
      (await settle(shift(-1), { ...cash, method: 'crypto' })).status,
    ).toBe(400);

    // Last month: the 129 € order moved there, 19,35 € of commission.
    const done = await settle(shift(-1), { ...cash, note: ' Faltan 9,65 ' });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({
      month: shift(-1),
      collected: '129.00',
      commission: '19.35',
      toKenova: '109.65',
      carriedIn: '0.00',
      due: '109.65',
      received: '100.00',
      pending: '9.65',
      method: 'cash',
      note: 'Faltan 9,65',
      createdBy: { id: t.superAdmin.id },
    });
    const again = await settle(shift(-1), cash);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Este mes ya está liquidado');
    const older = await settle(shift(-2), cash);
    expect(older.body.message).toContain(
      'Ya hay una liquidación de un mes posterior',
    );

    // The store sees it, and this month carries the 9,65 € pending.
    const last = (
      await get(vc, `/api/stores/${vcId}/commissions?month=${shift(-1)}`)
    ).body;
    expect(last.settlement).toMatchObject({ pending: '9.65' });
    const current = (await get(vc, `/api/stores/${vcId}/commissions`)).body;
    expect(current).toMatchObject({
      toKenova: '256.00',
      carriedIn: '9.65',
      due: '265.65',
      settlement: null,
    });

    // A mistake is undone from the latest settlement only.
    expect(
      (
        await send(
          'post',
          vc,
          `/api/stores/${vcId}/commissions/${shift(-1)}/settlement`,
        )
      ).status,
    ).toBe(403);
    const undo = await t
      .http()
      .delete(`/api/stores/${vcId}/commissions/${shift(-1)}/settlement`)
      .set('Cookie', sa)
      .set('Origin', ORIGIN);
    expect(undo.status).toBe(204);
    expect(
      (await get(vc, `/api/stores/${vcId}/commissions`)).body.carriedIn,
    ).toBe('0.00');
    const audit = await t.db.query(
      `SELECT action FROM audit_events WHERE "entityId" = $1 AND action LIKE 'COMMISSION_%' ORDER BY "createdAt"`,
      [vcId],
    );
    expect(audit.map((r: { action: string }) => r.action)).toEqual([
      'COMMISSION_SETTLED',
      'COMMISSION_SETTLEMENT_UNDONE',
    ]);
  });
});
