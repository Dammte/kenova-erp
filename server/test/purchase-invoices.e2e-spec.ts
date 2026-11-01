import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Preview {
  duplicateOf: { importedAt: string; by: string | null } | null;
  lines: {
    match: {
      kind: string;
      reason?: string;
      score?: number;
      part?: { id: string; stock: number };
    };
    waiting: { orderCode: string }[];
  }[];
}
interface Confirmed {
  units: number;
  cost: string;
  lines: {
    inventoryId: string;
    name: string;
    created: boolean;
    stockBefore: number;
    stockAfter: number;
    costPrice: string;
    received: { orderCode: string }[];
  }[];
}

describe('Supplier invoices into stock (/api/purchase-invoices)', () => {
  let t: TestContext;
  let sa: string;
  let battery: string;
  let a54: string;

  const post = (url: string, body: object) =>
    t.http().post(url).set('Cookie', sa).set('Origin', ORIGIN).send(body);
  const idOf = async (url: string, body: object) =>
    ((await post(url, body)).body as { id: string }).id;
  const stockOf = async (id: string) =>
    (
      await t.db.query<{ stock: number }[]>(
        `SELECT stock FROM inventory WHERE id = $1`,
        [id],
      )
    )[0].stock;
  const LINES = [
    {
      description: 'BATERIA IPHONE 13',
      ref: 'MP-88213',
      quantity: 5,
      unitCost: '20',
    },
    {
      description: 'BAT SAMSUNG A54 EB-BA546',
      ref: 'RN-5541',
      quantity: 2,
      unitCost: '14,20',
    },
    {
      description: 'FLEX BOTON HOME IPAD 9',
      ref: 'MP-77024',
      quantity: 2,
      unitCost: '7.40',
    },
  ];

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    battery = await idOf('/api/inventory', {
      sku: 'BAT-IP13',
      name: 'Batería iPhone 13',
      stock: 2,
      costPrice: '18.50',
    });
    a54 = await idOf('/api/inventory', {
      sku: 'BAT-SGA54',
      name: 'Batería Galaxy A54',
      stock: 0,
    });
  });
  afterAll(() => t.close());

  it('previews each line against the stock without changing it', async () => {
    const client = await idOf('/api/clients', {
      firstName: 'P',
      lastName: 'P',
    });
    const order = await idOf('/api/service-orders', { clientId: client });
    expect(
      (await post('/api/part-orders', { orderId: order, inventoryId: a54 }))
        .status,
    ).toBe(201);

    const res = await post('/api/purchase-invoices/preview', {
      provider: 'MovilParts',
      number: 'F-2026-1184',
      lines: LINES,
    });
    expect(res.status).toBe(200);
    const p = res.body as Preview;
    expect(p.duplicateOf).toBeNull();
    expect(p.lines.map((l) => l.match.kind)).toEqual([
      'match',
      'similar',
      'new',
    ]);
    expect(p.lines[0].match).toMatchObject({
      reason: 'name',
      part: { id: battery, stock: 2 },
    });
    expect(p.lines[1].match.part?.id).toBe(a54);
    expect(p.lines[1].waiting).toHaveLength(1);
    expect(await stockOf(battery)).toBe(2);
  });

  it('enters the invoice: average cost, new part, and the part order it covers', async () => {
    const res = await post('/api/purchase-invoices', {
      provider: 'MovilParts',
      number: 'F-2026-1184',
      invoiceDate: '2026-10-27',
      lines: [
        { ...LINES[0], inventoryId: battery },
        { ...LINES[1], inventoryId: a54 },
        {
          ...LINES[2],
          newPart: { name: 'Flex de botón home iPad 9', category: 'Flex' },
        },
      ],
    });
    expect(res.status).toBe(201);
    const r = res.body as Confirmed;
    expect(r.units).toBe(9);
    expect(r.cost).toBe('143.20');
    expect(r.lines[0]).toMatchObject({
      created: false,
      stockBefore: 2,
      stockAfter: 7,
      // (2 × 18,50 + 5 × 20) / 7
      costPrice: '19.57',
    });
    expect(r.lines[1].received.length).toBe(1);
    expect(r.lines[2]).toMatchObject({
      created: true,
      stockAfter: 2,
      costPrice: '7.40',
    });

    const [flex] = await t.db.query<object[]>(
      `SELECT sku, provider, category FROM inventory WHERE id = $1`,
      [r.lines[2].inventoryId],
    );
    expect(flex).toEqual({
      sku: 'MP-77024',
      provider: 'MovilParts',
      category: 'Flex',
    });
    const moves = (
      await t
        .http()
        .get(`/api/inventory/${battery}/movements`)
        .set('Cookie', sa)
    ).body as { kind: string; quantity: number; note: string }[];
    expect(moves[0]).toMatchObject({
      kind: 'purchase',
      quantity: 5,
      note: 'Factura F-2026-1184 · MovilParts',
    });
    // Received by the invoice: the stock is not raised a second time.
    const [po] = await t.db.query<{ receivedAt: Date | null }[]>(
      `SELECT "receivedAt" FROM part_orders WHERE "inventoryId" = $1`,
      [a54],
    );
    expect(po.receivedAt).not.toBeNull();
    expect(await stockOf(a54)).toBe(2);
  });

  it('warns about a repeated invoice and remembers the supplier references', async () => {
    const preview = (
      await post('/api/purchase-invoices/preview', {
        provider: 'movilparts',
        number: 'f-2026-1184',
        lines: [
          {
            description: 'otra cosa',
            ref: 'rn-5541',
            quantity: 1,
            unitCost: '1',
          },
        ],
      })
    ).body as Preview;
    expect(preview.duplicateOf?.by).toEqual(expect.any(String));
    // Linked in the last invoice, so now it matches by reference.
    expect(preview.lines[0].match).toMatchObject({
      kind: 'match',
      reason: 'ref',
      part: { id: a54 },
    });

    const again = {
      provider: 'MovilParts',
      number: 'F-2026-1184',
      lines: [{ ...LINES[0], inventoryId: battery }],
    };
    const res = await post('/api/purchase-invoices', again);
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toMatch(
      /^La factura F-2026-1184 ya se importó el \d{2}\/\d{2}\/\d{4}/,
    );
    expect(
      (await post('/api/purchase-invoices', { ...again, allowDuplicate: true }))
        .status,
    ).toBe(201);
  });

  it('refuses a line without a decision and leaves the stock as it was', async () => {
    const before = await stockOf(battery);
    const res = await post('/api/purchase-invoices', {
      provider: 'MovilParts',
      lines: [{ ...LINES[0], inventoryId: battery }, LINES[1]],
    });
    expect(res.status).toBe(400);
    const taken = await post('/api/purchase-invoices', {
      provider: 'MovilParts',
      lines: [
        { ...LINES[0], inventoryId: battery },
        { ...LINES[2], newPart: { name: 'x', sku: 'bat-ip13' } },
      ],
    });
    expect(taken.status).toBe(409);
    expect(await stockOf(battery)).toBe(before);
  });

  it('reads only PDFs and photos, and says when the AI is not set up', async () => {
    const send = (file: Buffer, name: string) =>
      t
        .http()
        .post('/api/purchase-invoices/read')
        .set('Cookie', sa)
        .set('Origin', ORIGIN)
        .attach('file', file, {
          filename: name,
          contentType: 'application/pdf',
        });
    const html = await send(Buffer.from('<html>no</html>'), 'factura.pdf');
    expect(html.status).toBe(400);
    expect((html.body as { message: string }).message).toBe(
      'Solo se aceptan PDF, JPG o PNG',
    );
    // Tests run without GEMINI_API_KEY: the screen offers typing the lines.
    const pdf = await send(Buffer.from('%PDF-1.4\n'), 'factura.pdf');
    expect(pdf.status).toBe(503);
    expect((pdf.body as { message: string }).message).toMatch(/a mano/);
  });

  it('is for the partners only', async () => {
    const store = await t.login(t.storeAdmin.email);
    const res = await t
      .http()
      .post('/api/purchase-invoices/preview')
      .set('Cookie', store)
      .set('Origin', ORIGIN)
      .send({ provider: 'x', lines: LINES });
    expect(res.status).toBe(403);
  });
});
