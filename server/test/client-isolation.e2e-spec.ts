import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Each partner store only sees its own clients and devices', () => {
  let t: TestContext;
  let sa: string;
  let main: string;
  let vc: string;
  // Ana: order in the main store. Bea: registered by Villarcayo, no order yet.
  // Carlos: order in Villarcayo. Dora: no order anywhere.
  const id: Record<'ana' | 'bea' | 'carlos' | 'dora', string> = {} as never;
  let anaDevice: string;

  const send = (
    method: 'post' | 'patch' | 'put',
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
  const names = async (cookie: string, url: string) =>
    ((await get(cookie, url)).body as { firstName: string }[])
      .map((c) => c.firstName)
      .sort();

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

    const client = async (cookie: string, body: object) =>
      (await send('post', cookie, '/api/clients', body)).body.id as string;
    id.ana = await client(sa, { firstName: 'Ana', phoneNumber: '600111111' });
    id.bea = await client(vc, { firstName: 'Bea', phoneNumber: '600222222' });
    id.carlos = await client(sa, { firstName: 'Carlos' });
    id.dora = await client(sa, {
      firstName: 'Dora',
      lastName: 'Gil',
      phoneNumber: '+34 600 999 888',
      dni: '12345678Z',
      address: 'Calle Mayor 1',
    });
    anaDevice = (
      await send('post', sa, '/api/devices', {
        clientId: id.ana,
        type: 'movil',
        brand: 'Apple',
        model: 'iPhone 13',
        code: '1234',
      })
    ).body.id;
    await send('post', main, '/api/service-orders', {
      clientId: id.ana,
      deviceId: anaDevice,
    });
    await send('post', vc, '/api/service-orders', { clientId: id.carlos });
  });
  afterAll(() => t.close());

  it('lists the clients registered by the store or with an order there', async () => {
    expect(await names(vc, '/api/clients')).toEqual(['Bea', 'Carlos']);
    expect(await names(main, '/api/clients')).toEqual(['Ana']);
    expect(await names(sa, '/api/clients')).toEqual([
      'Ana',
      'Bea',
      'Carlos',
      'Dora',
    ]);
  });

  it("answers 404 for another store's client and leaves it unchanged", async () => {
    const url = `/api/clients/${id.ana}`;
    expect((await get(vc, url)).status).toBe(404);
    expect((await send('put', vc, url, { firstName: 'X' })).status).toBe(404);
    expect((await send('patch', vc, url, { firstName: 'X' })).status).toBe(404);
    expect((await get(sa, url)).body.firstName).toBe('Ana');
    expect((await get(vc, `/api/clients/${id.bea}`)).status).toBe(200);
  });

  it('partial search only covers the own clients', async () => {
    // Every client has a phone starting with 600; Villarcayo only finds Bea.
    expect(await names(vc, '/api/clients/search?q=600')).toEqual(['Bea']);
    expect(await names(sa, '/api/clients/search?q=600')).toEqual([
      'Ana',
      'Bea',
      'Dora',
    ]);
    expect(await names(vc, '/api/clients/search?q=600%20999')).toEqual([]);
    expect(await names(sa, '/api/clients/search?q=Dora')).toEqual(['Dora']);
  });

  it('finds a client of another store by exact phone, with only name and phone', async () => {
    for (const q of ['600999888', '600 999 888', '+34600999888']) {
      const res = await get(
        vc,
        `/api/clients/search?q=${encodeURIComponent(q)}`,
      );
      expect(res.body).toEqual([
        {
          id: id.dora,
          firstName: 'Dora',
          lastName: 'Gil',
          phoneNumber: '+34 600 999 888',
        },
      ]);
    }
  });

  it('finds a client of another store by exact DNI, with only name and phone', async () => {
    const res = await get(vc, '/api/clients/search?dni=12345678z');
    expect(res.body).toEqual([
      {
        id: id.dora,
        firstName: 'Dora',
        lastName: 'Gil',
        phoneNumber: '+34 600 999 888',
      },
    ]);
    const full = await get(sa, '/api/clients/search?dni=12345678Z');
    expect(full.body[0].address).toBe('Calle Mayor 1');
  });

  it("hides another store's devices and their unlock code", async () => {
    expect((await get(vc, `/api/devices/${anaDevice}`)).status).toBe(404);
    expect((await get(vc, `/api/devices/client/${id.ana}`)).status).toBe(404);
    const listed = (await get(vc, '/api/devices')).body as { id: string }[];
    expect(listed.map((d) => d.id)).not.toContain(anaDevice);
    expect(
      (await send('post', vc, `/api/devices/${anaDevice}/unlock-secret/reveal`))
        .status,
    ).toBe(404);
    expect(
      (await send('put', vc, `/api/devices/${anaDevice}`, { model: 'X' }))
        .status,
    ).toBe(404);
    expect(
      (
        await send('post', vc, '/api/devices', {
          clientId: id.ana,
          type: 'movil',
          brand: 'Apple',
          model: 'iPhone 14',
        })
      ).status,
    ).toBe(404);
    expect((await get(main, `/api/devices/${anaDevice}`)).status).toBe(200);
    expect(
      (
        await send(
          'post',
          main,
          `/api/devices/${anaDevice}/unlock-secret/reveal`,
        )
      ).body.value,
    ).toBe('1234');
  });

  it('an order cannot take a device of another client', async () => {
    const carlosOrder = (await get(vc, '/api/service-orders')).body[0].id;
    const res = await send('patch', sa, `/api/service-orders/${carlosOrder}`, {
      deviceId: anaDevice,
    });
    expect(res.status).toBe(400);
  });

  it('reusing a client found by phone makes it one of the store', async () => {
    const res = await send('post', vc, '/api/service-orders/intake', {
      clientId: id.dora,
      device: { type: 'movil', brand: 'Samsung', model: 'Galaxy S21' },
      order: {},
    });
    expect(res.status).toBe(201);
    const dora = await get(vc, `/api/clients/${id.dora}`);
    expect(dora.status).toBe(200);
    expect(dora.body.address).toBe('Calle Mayor 1');
    expect(await names(vc, '/api/clients')).toEqual(['Bea', 'Carlos', 'Dora']);
  });

  it('a client registered by a store records that store', async () => {
    const [bea] = await t.db.query(
      `SELECT s.prefix FROM client c JOIN stores s ON s.id = c."storeId" WHERE c.id = $1`,
      [id.bea],
    );
    expect(bea.prefix).toBe('VC');
    const [ana] = await t.db.query(
      `SELECT "storeId" FROM client WHERE id = $1`,
      [id.ana],
    );
    expect(ana.storeId).toBeNull();
  });
});
