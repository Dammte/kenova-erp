import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Row {
  id: string;
  name: string;
  brand: { id: string; name: string } | null;
  deviceType: string | null;
  active: boolean;
  devices: number;
  rates: number;
  duplicates: string[];
}

describe('Catálogo de modelos (R2 3.8)', () => {
  let t: TestContext;
  let sa: string;
  let store: string;
  let apple: string;
  let iphone13: string;
  let lower13: string;
  let iphone12: string;
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
  const list = async () =>
    (await t.http().get('/api/catalog/models').set('Cookie', sa)).body as Row[];
  const row = async (id: string) => (await list()).find((r) => r.id === id);
  const model = async (name: string, brandId: string) =>
    (await send('post', sa, '/api/models', { name, brandId })).body
      .id as string;
  const device = (model: string, brand = 'Apple') =>
    send('post', sa, '/api/devices', {
      type: 'movil',
      brand,
      model,
      clientId,
    });
  const rate = (name: string, modelId: string, price: number) =>
    send('post', sa, '/api/services', {
      name,
      category: 'Pantalla',
      price,
      description: '',
      available: true,
      modelId,
      quality: 'original',
    });

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
    clientId = (
      await send('post', sa, '/api/clients', {
        firstName: 'Iker',
        phoneNumber: '600111222',
      })
    ).body.id;
    apple = (await send('post', sa, '/api/brands', { name: 'Apple' })).body.id;
    iphone13 = await model('iPhone 13', apple);
    iphone12 = await model('iPhone 12', apple);
    // Typed with capitals so it is stored as is, like an old duplicate.
    lower13 = (
      await t.db.query(
        `INSERT INTO model (name, "brandId") VALUES ('iphone  13', $1) RETURNING id`,
        [apple],
      )
    )[0].id;
    await device('iPhone 13');
    await device('iPhone 13');
    await device('iphone  13');
    await rate('Pantalla iPhone 13', iphone13, 129);
    await rate('Batería iPhone 13', lower13, 59);
  });
  afterAll(() => t.close());

  it('only the partners see and change the catalogue', async () => {
    const get = await t.http().get('/api/catalog/models').set('Cookie', store);
    expect(get.status).toBe(403);
    const patch = await send(
      'patch',
      store,
      `/api/catalog/models/${iphone12}`,
      {
        active: false,
      },
    );
    expect(patch.status).toBe(403);
  });

  it('lists each model with its devices, rates and look-alike duplicates', async () => {
    const rows = await list();
    // Sorted by brand, then name, with look-alikes side by side.
    expect(rows.map((r) => r.name)).toEqual([
      'iPhone 12',
      'iphone  13',
      'iPhone 13',
    ]);
    expect(await row(iphone13)).toMatchObject({
      brand: { id: apple, name: 'Apple' },
      deviceType: null,
      active: true,
      devices: 2,
      rates: 1,
      duplicates: [lower13],
    });
    expect(await row(lower13)).toMatchObject({
      devices: 1,
      rates: 1,
      duplicates: [iphone13],
    });
    expect((await row(iphone12))?.duplicates).toEqual([]);
  });

  it('sets the device type and withdraws a model, keeping it listed', async () => {
    const res = await send('patch', sa, `/api/catalog/models/${iphone12}`, {
      deviceType: 'movil',
      active: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deviceType: 'movil', active: false });
    const bad = await send('patch', sa, `/api/catalog/models/${iphone12}`, {
      deviceType: 'nevera',
    });
    expect(bad.status).toBe(400);
  });

  it('a rename that would make a duplicate says to merge instead', async () => {
    const res = await send('patch', sa, `/api/catalog/models/${iphone12}`, {
      name: 'IPHONE 13',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'Ya existe «iPhone 13» en Apple: únelos en vez de renombrar.',
    );
  });

  it('a rename carries the devices that read like the old name', async () => {
    await device('iPhone 12');
    const res = await send('patch', sa, `/api/catalog/models/${iphone12}`, {
      name: 'iPhone 12 ',
    });
    expect(res.body).toMatchObject({ name: 'iPhone 12', devices: 1 });
    const renamed = await send('patch', sa, `/api/catalog/models/${iphone12}`, {
      name: 'iPhone 12 mini',
    });
    expect(renamed.body).toMatchObject({ name: 'iPhone 12 mini', devices: 1 });
  });

  it('merging refuses to lose a rate both models have', async () => {
    const clash = (await rate('Pantalla iPhone 13', lower13, 119)).body
      .id as string;
    const res = await send(
      'post',
      sa,
      `/api/catalog/models/${iphone13}/merge`,
      { fromId: lower13 },
    );
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'No se ha podido unir: iphone  13 tiene la tarifa «Pantalla iPhone 13», que iPhone 13 ya tiene. Retira una de las dos en Tarifas antes de unir.',
    );
    // A withdrawn rate does not block the merge.
    await send('patch', sa, `/api/services/${clash}`, { available: false });
  });

  it('refuses to merge a model with itself or with another brand', async () => {
    const self = await send(
      'post',
      sa,
      `/api/catalog/models/${iphone13}/merge`,
      { fromId: iphone13 },
    );
    expect(self.status).toBe(400);
    const samsung = (await send('post', sa, '/api/brands', { name: 'Samsung' }))
      .body.id as string;
    const s23 = await model('Galaxy S23', samsung);
    const other = await send(
      'post',
      sa,
      `/api/catalog/models/${iphone13}/merge`,
      { fromId: s23 },
    );
    expect(other.status).toBe(400);
    expect(other.body.message).toBe('Solo se unen modelos de la misma marca');
  });

  it('merges the duplicate: its rates and devices move and it goes away', async () => {
    await t.db.query(`UPDATE model SET "deviceType" = 'movil' WHERE id = $1`, [
      lower13,
    ]);
    const res = await send(
      'post',
      sa,
      `/api/catalog/models/${iphone13}/merge`,
      { fromId: lower13 },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'iPhone 13',
      deviceType: 'movil',
      devices: 3,
      rates: 3,
      duplicates: [],
    });
    expect(await row(lower13)).toBeUndefined();
    const audit = await t.db.query(
      `SELECT metadata FROM audit_events WHERE action = 'MODELS_MERGED' AND "entityId" = $1`,
      [iphone13],
    );
    expect(audit[0].metadata).toMatchObject({
      from: { id: lower13, name: 'iphone  13' },
      into: 'iPhone 13',
      rates: 2,
      devices: 1,
    });
  });
});
