import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Inventory and parts consumption', () => {
  let t: TestContext;
  let cookie: string;
  let orderId: string;

  const post = (url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const part = async (sku: string, stock: number) =>
    (
      await post('/api/inventory', {
        sku,
        name: `Pieza ${sku}`,
        stock,
        costPrice: '12,50',
        salesPrice: '30',
      })
    ).body;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    const c = (await post('/api/clients', { firstName: 'i', lastName: 'i' }))
      .body;
    orderId = (await post('/api/service-orders', { clientId: c.id })).body.id;
  });
  afterAll(() => t.close());

  it('validates stock and prices', async () => {
    expect(
      (await post('/api/inventory', { sku: 'N1', name: 'x', stock: -1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await post('/api/inventory', {
          sku: 'N2',
          name: 'x',
          costPrice: 'diez euros',
        })
      ).status,
    ).toBe(400);
    expect(
      (await post('/api/inventory', { sku: 'N3', name: 'x', stock: 1.5 }))
        .status,
    ).toBe(400);
    const ok = await post('/api/inventory', {
      sku: 'N4',
      name: 'x',
      stock: 3,
      costPrice: 9.99,
      salesPrice: 20,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.costPrice).toBe('9.99');
    expect(ok.body.createdBy).toBe(t.storeAdmin.id);
  });

  it('never loses or oversells the last unit under concurrency', async () => {
    const p = await part('LAST1', 1);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        post(`/api/service-orders/${orderId}/consume-parts`, {
          parts: [{ inventoryId: p.id, quantity: 1 }],
        }),
      ),
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([200, 409, 409, 409, 409, 409]);
    const [row] = await t.db.query(
      `SELECT stock FROM inventory WHERE id = $1`,
      [p.id],
    );
    expect(row.stock).toBe(0);
  });

  it('many parallel consumptions add up exactly', async () => {
    const p = await part('MANY', 20);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        post(`/api/service-orders/${orderId}/consume-parts`, {
          parts: [{ inventoryId: p.id, quantity: 2 }],
        }),
      ),
    );
    const [row] = await t.db.query(
      `SELECT stock FROM inventory WHERE id = $1`,
      [p.id],
    );
    expect(row.stock).toBe(0);
  });

  it('is all-or-nothing when one of the parts is short', async () => {
    const a = await part('A1', 5);
    const b = await part('B1', 1);
    const res = await post(`/api/service-orders/${orderId}/consume-parts`, {
      parts: [
        { inventoryId: a.id, quantity: 2 },
        { inventoryId: b.id, quantity: 3 },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Stock insuficiente/);
    const rows = await t.db.query(
      `SELECT sku, stock FROM inventory WHERE id IN ($1, $2) ORDER BY sku`,
      [a.id, b.id],
    );
    expect(rows).toEqual([
      { sku: 'A1', stock: 5 },
      { sku: 'B1', stock: 1 },
    ]);
  });

  it('records the consumption on the order history with its author', async () => {
    const a = await part('H1', 4);
    const res = await post(`/api/service-orders/${orderId}/consume-parts`, {
      parts: [{ inventoryId: a.id, quantity: 3 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.parts).toEqual([
      { inventoryId: a.id, name: 'Pieza H1', quantity: 3, stock: 1 },
    ]);
    const hist = await t
      .http()
      .get(`/api/service-history/order/${orderId}`)
      .set('Cookie', cookie);
    const entry = hist.body.find(
      (h: any) =>
        h.action === 'piezas_usadas' && h.description.includes('Pieza H1'),
    );
    expect(entry.performedBy.id).toBe(t.storeAdmin.id);
  });

  it('bulk import adds stock atomically instead of overwriting it', async () => {
    const p = await part('BULK', 1);
    await Promise.all(
      Array.from({ length: 5 }, () =>
        post('/api/inventory/bulk', [
          { sku: 'bulk', name: 'Pieza BULK', stock: 2, costPrice: '3' },
        ]),
      ),
    );
    const [row] = await t.db.query(
      `SELECT stock FROM inventory WHERE id = $1`,
      [p.id],
    );
    expect(row.stock).toBe(11);
    const bad = await post('/api/inventory/bulk', [{ name: 'x', stock: -3 }]);
    expect(bad.status).toBe(400);
  });

  it('only accepts real PDFs for AI import', async () => {
    const res = await t
      .http()
      .post('/api/inventory/import/analyze')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .attach('file', Buffer.from('<html>not a pdf</html>'), {
        filename: 'factura.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/PDF/);
  });

  it('rejects uploads over 10 MB without buffering them', async () => {
    const big = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.alloc(11 * 1024 * 1024),
    ]);
    const res = await t
      .http()
      .post('/api/inventory/import/analyze')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .attach('file', big, {
        filename: 'grande.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(413);
  });

  it('deleting a part is a soft delete', async () => {
    const p = await part('DEL', 1);
    expect(
      (
        await t
          .http()
          .delete(`/api/inventory/${p.id}`)
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
      ).status,
    ).toBe(204);
    expect(
      (await t.http().get(`/api/inventory/${p.id}`).set('Cookie', cookie))
        .status,
    ).toBe(404);
    const [row] = await t.db.query(
      `SELECT "deletedAt" FROM inventory WHERE id = $1`,
      [p.id],
    );
    expect(row.deletedAt).not.toBeNull();
  });
});
