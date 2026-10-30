import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Each partner store only sees its own orders', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let vc: string;
  let clientId: string;
  let mainOrder: string;
  let vcOrder: string;
  let mainNote: number;
  let mainEntry: string;

  const send = (
    method: 'post' | 'patch' | 'put' | 'delete',
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

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    main = await t.login(t.storeAdmin.email);

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
    vc = await t.login('vc@kenova.test');

    clientId = (await send('post', sa, '/api/clients', { firstName: 'Ana' }))
      .body.id;
    mainOrder = (await send('post', main, '/api/service-orders', { clientId }))
      .body.id;
    vcOrder = (await send('post', vc, '/api/service-orders', { clientId })).body
      .id;
    mainNote = (
      await send(
        'post',
        main,
        `/api/service-orders/${mainOrder}/sticky-notes`,
        {
          content: 'Llamar al cliente',
          type: 'normal',
        },
      )
    ).body.id;
    mainEntry = (
      await send('post', main, '/api/service-history', {
        serviceOrderId: mainOrder,
        action: 'nota',
        description: 'Revisado',
      })
    ).body.id;
  });
  afterAll(() => t.close());

  it('lists only the orders of the own store', async () => {
    const ids = async (cookie: string, url: string) =>
      ((await get(cookie, url)).body as { id: string }[]).map((o) => o.id);

    expect(await ids(vc, '/api/service-orders')).toEqual([vcOrder]);
    expect(await ids(main, '/api/service-orders')).toEqual([mainOrder]);
    expect((await ids(sa, '/api/service-orders')).sort()).toEqual(
      [mainOrder, vcOrder].sort(),
    );
    expect(await ids(vc, `/api/service-orders/client/${clientId}`)).toEqual([
      vcOrder,
    ]);
  });

  it("answers 404 for another store's order and leaves it unchanged", async () => {
    const url = `/api/service-orders/${mainOrder}`;
    expect((await get(vc, url)).status).toBe(404);
    expect((await send('patch', vc, url, { status: 'cancelado' })).status).toBe(
      404,
    );
    expect(
      (
        await send('post', vc, `${url}/consume-parts`, {
          parts: [{ inventoryId: clientId, quantity: 1 }],
        })
      ).status,
    ).toBe(404);
    const [row] = await t.db.query(
      `SELECT status FROM service_orders WHERE id = $1`,
      [mainOrder],
    );
    expect(row.status).not.toBe('cancelado');
    // The own store and the workshop admins still reach it.
    expect((await get(main, url)).status).toBe(200);
    expect((await get(sa, url)).status).toBe(200);
  });

  it("hides another store's history entries", async () => {
    expect(
      (await get(vc, `/api/service-history/order/${mainOrder}`)).status,
    ).toBe(404);
    expect((await get(vc, `/api/service-history/${mainEntry}`)).status).toBe(
      404,
    );
    expect(
      (
        await send('post', vc, '/api/service-history', {
          serviceOrderId: mainOrder,
          action: 'nota',
          description: 'Intruso',
        })
      ).status,
    ).toBe(404);
    expect((await get(main, `/api/service-history/${mainEntry}`)).status).toBe(
      200,
    );
    expect(
      (await get(sa, `/api/service-history/order/${mainOrder}`)).body.length,
    ).toBeGreaterThan(0);
  });

  it("hides another store's sticky notes", async () => {
    const base = `/api/service-orders/${mainOrder}/sticky-notes`;
    expect((await get(vc, base)).status).toBe(404);
    expect((await get(vc, `${base}/${mainNote}`)).status).toBe(404);
    expect(
      (await send('post', vc, base, { content: 'x', type: 'normal' })).status,
    ).toBe(404);
    expect(
      (await send('put', vc, `${base}/${mainNote}`, { content: 'x' })).status,
    ).toBe(404);
    expect((await send('delete', vc, `${base}/${mainNote}`)).status).toBe(404);
    const notes = (await get(main, base)).body as { content: string }[];
    expect(notes.map((n) => n.content)).toEqual(['Llamar al cliente']);
  });

  it('a note cannot be reached through an order it does not belong to', async () => {
    const res = await get(
      vc,
      `/api/service-orders/${vcOrder}/sticky-notes/${mainNote}`,
    );
    expect(res.status).toBe(404);
  });
});
