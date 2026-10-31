import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Rate {
  name: string;
  price: string;
  quality: string | null;
  model: { name: string; brand: string | null } | null;
  stock: { units: number; low: boolean } | null;
}

describe('Price list (tarifas)', () => {
  let t: TestContext;
  let sa: string;
  let store: string;

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
  const rates = async (q: string, cookie = sa) =>
    (
      await t
        .http()
        .get(`/api/services/rates?q=${encodeURIComponent(q)}`)
        .set('Cookie', cookie)
    ).body as Rate[];
  const brief = (r: Rate) => [r.name, r.quality, r.model?.name ?? null];

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);

    const samsung = (await send('post', sa, '/api/brands', { name: 'Samsung' }))
      .body.id;
    const a54 = (
      await send('post', sa, '/api/models', {
        name: 'Galaxy A54',
        brandId: samsung,
      })
    ).body.id;
    const part = (
      await send('post', sa, '/api/inventory', {
        sku: 'BAT-A54-C',
        name: 'Batería Galaxy A54 compatible',
        stock: 2,
        minimalStock: 2,
      })
    ).body.id;
    const add = (body: object) =>
      send('post', sa, '/api/services', {
        available: true,
        description: '',
        ...body,
      });
    const first = await add({
      name: 'Batería Galaxy A54',
      category: 'Batería',
      price: 55,
      estimatedTime: '1 h',
      modelId: a54,
      quality: 'compatible',
      inventoryId: part,
    });
    expect(first.body).toMatchObject({ quality: 'compatible' });
    await add({
      name: 'Batería Galaxy A54',
      category: 'Batería',
      price: 79,
      modelId: a54,
      quality: 'original',
    });
    await add({
      name: 'Conector de carga Galaxy A54',
      category: 'Conector',
      price: 45,
      modelId: a54,
    });
    await add({
      name: 'Batería genérica',
      category: 'Batería',
      price: 30,
      available: false,
    });
  });
  afterAll(() => t.close());

  it('finds rates by any mix of service, model and brand, ignoring accents and case', async () => {
    expect((await rates('bateria a54')).map(brief)).toEqual([
      ['Batería Galaxy A54', 'compatible', 'Galaxy A54'],
      ['Batería Galaxy A54', 'original', 'Galaxy A54'],
    ]);
    expect((await rates('SAMSUNG conector')).map(brief)).toEqual([
      ['Conector de carga Galaxy A54', null, 'Galaxy A54'],
    ]);
    expect((await rates('bateria a54'))[0].model?.brand).toBe('Samsung');
  });

  it('leaves out services that are not available, and needs something to search', async () => {
    expect((await rates('generica')).length).toBe(0);
    expect(await rates('  ')).toEqual([]);
  });

  it('shows the linked part stock to SUPER_ADMIN only', async () => {
    const [compatible, original] = await rates('bateria a54');
    expect(compatible.stock).toEqual({ units: 2, low: true });
    expect(original.stock).toBeNull();
    const seenByStore = await rates('bateria a54', store);
    expect(seenByStore.map(brief)).toEqual(
      (await rates('bateria a54')).map(brief),
    );
    expect(seenByStore.every((r) => r.stock === null)).toBe(true);
  });

  it('rejects an unknown quality and lets only SUPER_ADMIN change the price list', async () => {
    const bad = await send('post', sa, '/api/services', {
      name: 'X',
      description: '',
      price: 1,
      quality: 'premium',
    });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body.message)).toContain('compatible u original');
    expect(
      (await send('post', store, '/api/services', { name: 'X', price: 1 }))
        .status,
    ).toBe(403);
    const [first] = await rates('conector');
    const id = (
      await t.http().get('/api/services').set('Cookie', sa)
    ).body.find((s: { name: string }) => s.name === first.name).id as string;
    expect(
      (await send('patch', store, `/api/services/${id}`, { price: 1 })).status,
    ).toBe(403);
    expect((await send('delete', store, `/api/services/${id}`)).status).toBe(
      403,
    );
    expect(
      (await send('patch', sa, `/api/services/${id}`, { modelId: null }))
        .status,
    ).toBe(200);
    expect((await rates('conector'))[0].model).toBeNull();
  });
});
