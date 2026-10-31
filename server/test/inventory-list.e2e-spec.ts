import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Page {
  total: number;
  rows: {
    sku: string;
    stock: number;
    status: string;
    costPrice: string | null;
  }[];
  counts: { all: number; low: number; byCategory: Record<string, number> };
  brands: string[];
  providers: string[];
}

describe('Parts list (GET /api/inventory/list)', () => {
  let t: TestContext;
  let sa: string;

  const post = (url: string, body: object) =>
    t.http().post(url).set('Cookie', sa).set('Origin', ORIGIN).send(body);
  const list = async (query = '') => {
    const res = await t
      .http()
      .get(`/api/inventory/list${query}`)
      .set('Cookie', sa);
    expect(res.status).toBe(200);
    return res.body as Page;
  };
  const skus = (p: Page) => p.rows.map((r) => r.sku);

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    const part = (
      sku: string,
      name: string,
      category: string,
      stock: number,
      minimalStock: number,
      extra: object = {},
    ) =>
      post('/api/inventory', {
        sku,
        name,
        category,
        stock,
        minimalStock,
        brand: 'Apple',
        provider: 'MovilParts',
        costPrice: '72',
        salesPrice: '149',
        ...extra,
      });
    for (const r of await Promise.all([
      part('PAN-IP13-OLED', 'Pantalla iPhone 13 OLED', 'Pantallas', 0, 1, {
        model: 'iPhone 13',
      }),
      part('PAN-IP12-OLED', 'Pantalla iPhone 12 OLED', 'Pantallas', 3, 1),
      part('BAT-IP13', 'Batería iPhone 13', 'Baterías', 2, 3),
      part('BAT-SGA54', 'Batería Galaxy A54', 'Baterías', 5, 2, {
        brand: 'Samsung',
        provider: 'RecambiosNorte',
      }),
      part('ADH-UNIV-01', 'Adhesivo de pantalla', 'Consumibles', 1, 10, {
        brand: null,
        provider: 'Amazon',
      }),
    ])) {
      expect(r.status).toBe(201);
    }
  });
  afterAll(() => t.close());

  it('lists every part by name with its stock status and the chip counts', async () => {
    const p = await list();
    expect(p.total).toBe(5);
    expect(skus(p)).toEqual([
      'ADH-UNIV-01',
      'BAT-SGA54',
      'BAT-IP13',
      'PAN-IP12-OLED',
      'PAN-IP13-OLED',
    ]);
    expect(Object.fromEntries(p.rows.map((r) => [r.sku, r.status]))).toEqual({
      'ADH-UNIV-01': 'low',
      'BAT-SGA54': 'ok',
      'BAT-IP13': 'low',
      'PAN-IP12-OLED': 'ok',
      'PAN-IP13-OLED': 'out',
    });
    expect(p.rows[0].costPrice).toBe('72.00');
    expect(p.counts).toEqual({
      all: 5,
      low: 3,
      byCategory: { Pantallas: 2, Baterías: 2, Consumibles: 1 },
    });
    expect(p.brands).toEqual(['Apple', 'Samsung']);
    expect(p.providers).toEqual(['Amazon', 'MovilParts', 'RecambiosNorte']);
  });

  it('filters by chip, search, brand and provider', async () => {
    expect(skus(await list('?low=true'))).toEqual([
      'ADH-UNIV-01',
      'BAT-IP13',
      'PAN-IP13-OLED',
    ]);
    expect(skus(await list('?category=Baterías&low=true'))).toEqual([
      'BAT-IP13',
    ]);
    // A compatible model, a SKU piece or the brand.
    expect(skus(await list('?q=iphone%2013'))).toEqual([
      'BAT-IP13',
      'PAN-IP13-OLED',
    ]);
    expect(skus(await list('?q=sga54'))).toEqual(['BAT-SGA54']);
    expect(skus(await list('?q=100%25'))).toEqual([]);
    const apple = await list('?brand=Apple&q=pantalla');
    expect(skus(apple)).toEqual(['PAN-IP12-OLED', 'PAN-IP13-OLED']);
    // The chips count within the search.
    expect(apple.counts).toEqual({
      all: 2,
      low: 1,
      byCategory: { Pantallas: 2 },
    });
    expect(skus(await list('?provider=Amazon'))).toEqual(['ADH-UNIV-01']);
  });

  it('leaves out deleted parts and pages by 50', async () => {
    const del = await post('/api/inventory', { sku: 'DEL-1', name: 'Borrada' });
    await t
      .http()
      .delete(`/api/inventory/${(del.body as { id: string }).id}`)
      .set('Cookie', sa)
      .set('Origin', ORIGIN);
    expect((await list()).total).toBe(5);
    expect((await list('?page=2')).rows).toEqual([]);
    const bad = await t
      .http()
      .get('/api/inventory/list?page=0')
      .set('Cookie', sa);
    expect(bad.status).toBe(400);
  });

  it('is for the partners only', async () => {
    const store = await t.login(t.storeAdmin.email);
    expect(
      (await t.http().get('/api/inventory/list').set('Cookie', store)).status,
    ).toBe(403);
  });
});
