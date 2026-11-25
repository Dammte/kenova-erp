import { readFileSync } from 'fs';
import { join } from 'path';
import { MAX_PAGES_PER_SYNC } from '../src/suppliers/orders/supplier-orders.service';
import { PRESTASHOP_DEFAULTS } from '../src/suppliers/web/web-config';
import { SupplierWebService } from '../src/suppliers/web/supplier-web.service';
import { ORIGIN, TestContext, createTestApp } from './utils/harness';

const BASE = 'https://b2b.proveedor.test';
const page = (name: string) =>
  readFileSync(join(__dirname, 'fixtures/prestashop', name), 'utf8');

interface Row {
  id: string;
  ref: string;
  date?: string;
  total?: string;
  status?: string;
}

/** The history page of the fixture, with these rows. */
const historyPage = (rows: Row[]) =>
  page('history.html').replace(
    /<tbody>[\s\S]*<\/tbody>/,
    `<tbody>${rows
      .map(
        (
          r,
        ) => `<tr><th scope="row">${r.ref}</th><td>${r.date ?? '25/11/2026'}</td>
          <td>${r.total ?? '10,00 €'}</td><td>Tarjeta</td><td><span>${r.status ?? 'Pago aceptado'}</span></td><td>-</td>
          <td><a href="${BASE}/index.php?controller=order-detail&amp;id_order=${r.id}">Datos</a></td></tr>`,
      )
      .join('')}</tbody>`,
  );

describe('Pedidos del proveedor', () => {
  let t: TestContext;
  let sa: string;
  let store: string;
  let id: string;
  let rows: Row[];
  /** Order ids whose page has no readable lines. */
  let broken: Set<string>;
  let calls: { method: string; url: string }[];

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
  const get = (url: string, cookie = sa) =>
    t.http().get(url).set('Cookie', cookie);
  const sync = () => send('post', sa, `/api/suppliers/${id}/sync`);
  const detailReads = () =>
    calls.filter((c) => c.url.includes('controller=order-detail')).length;

  /** A fake supplier website: login, history and order pages. */
  const fetcher = async (url: string, init: RequestInit) => {
    const u = new URL(url);
    calls.push({ method: init.method!, url });
    const cookie = (init.headers as Record<string, string>).Cookie ?? '';
    if (u.pathname === '/iniciar-sesion' && init.method === 'POST') {
      return new Response(null, {
        status: 302,
        headers: { location: '/historial-compra', 'set-cookie': 'PS=in' },
      });
    }
    if (u.searchParams.get('controller') === 'authentication')
      return new Response(page('login.html'));
    if (cookie !== 'PS=in') return new Response(page('login.html'));
    if (u.pathname === '/historial-compra')
      return new Response(historyPage(rows));
    if (u.searchParams.get('controller') === 'order-detail') {
      return broken.has(u.searchParams.get('id_order')!)
        ? new Response('<html><body>Mantenimiento</body></html>')
        : new Response(page('order-detail.html'));
    }
    return new Response('no', { status: 404 });
  };

  const count = async (table: string) =>
    (
      await t.db.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE ${
          table === 'supplier_orders'
            ? '"supplierId" = $1'
            : `"orderId" IN (SELECT id FROM supplier_orders WHERE "supplierId" = $1)`
        }`,
        [id],
      )
    )[0].n;

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
    id = (await send('post', sa, '/api/suppliers', { name: 'Delta' })).body.id;
    await send('put', sa, `/api/suppliers/${id}/connection`, {
      ...PRESTASHOP_DEFAULTS,
      baseUrl: `${BASE}/`,
    });
    await send('put', sa, `/api/suppliers/${id}/credentials`, {
      username: 'compras@kenova.test',
      password: 'S3creta!',
    });
  });
  afterAll(() => t.close());

  beforeEach(() => {
    calls = [];
    broken = new Set();
    t.app.get(SupplierWebService).sessionOptions = {
      fetcher,
      resolver: async () => ['203.0.113.10'],
    };
  });

  it('the first time, keeps the whole history as received before the ERP, without reading each order', async () => {
    rows = [
      { id: '20', ref: 'REFVEINTE', date: '20/11/2026', total: '30,50 €' },
      { id: '10', ref: 'REFDIEZ', date: '10/10/2025' },
    ];
    const res = await sync();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      added: 2,
      updated: 0,
      waiting: 0,
      firstSync: true,
    });
    expect(detailReads()).toBe(0);
    const list = await get(`/api/supplier-orders?supplierId=${id}`);
    expect(list.body.total).toBe(2);
    expect(list.body.counts).toEqual({ ANTERIOR: 2 });
    expect(list.body.items[0]).toMatchObject({
      externalId: '20',
      reference: 'REFVEINTE',
      orderDate: '2026-11-20',
      total: '30.5',
      supplierStatus: 'Pago aceptado',
      state: 'ANTERIOR',
      linesReadAt: null,
      detailUrl: `${BASE}/index.php?controller=order-detail&id_order=20`,
      supplier: { id, name: 'Delta' },
    });
    const supplier = (await get(`/api/suppliers/${id}`)).body;
    expect(supplier.ordersSyncedAt).toEqual(expect.any(String));
  });

  it('then adds only the new orders, pending, with their lines, and never twice', async () => {
    rows = [{ id: '30', ref: 'REFTREINTA' }, ...rows];
    const res = await sync();
    expect(res.body).toEqual({
      added: 1,
      updated: 0,
      waiting: 0,
      firstSync: false,
    });
    expect(detailReads()).toBe(1);
    const again = await sync();
    expect(again.body).toMatchObject({ added: 0, updated: 0 });
    expect(await count('supplier_orders')).toBe(3);

    const list = await get(
      `/api/supplier-orders?supplierId=${id}&state=PENDIENTE`,
    );
    expect(list.body.counts).toEqual({ ANTERIOR: 2, PENDIENTE: 1 });
    expect(list.body.items).toHaveLength(1);
    const order = (await get(`/api/supplier-orders/${list.body.items[0].id}`))
      .body;
    expect(order).toMatchObject({
      reference: 'REFTREINTA',
      state: 'PENDIENTE',
    });
    expect(order.lines).toHaveLength(2);
    expect(order.lines[0]).toMatchObject({
      position: 0,
      ref: 'BT0001',
      quantity: 2,
      unitPrice: '20.52',
      lineTotal: '41.04',
      productUrl: `${BASE}/busqueda?controller=search&s=BT0001`,
    });
    expect(order.lines[1].productUrl).toBe(
      `${BASE}/pantallas/77-pantalla-y.html`,
    );
    // Only reads: the one thing sent is the login form, once per «Sincronizar».
    expect(calls.filter((c) => c.method !== 'GET').map((c) => c.url)).toEqual([
      `${BASE}/iniciar-sesion?back=history`,
      `${BASE}/iniciar-sesion?back=history`,
    ]);
  });

  it('updates what the supplier changed, without touching Kenova’s state or lines', async () => {
    rows = rows.map((r) => (r.id === '30' ? { ...r, status: 'Enviado' } : r));
    const res = await sync();
    expect(res.body).toMatchObject({ added: 0, updated: 1 });
    const [row] = await t.db.query(
      `SELECT "supplierStatus", state FROM supplier_orders WHERE "supplierId" = $1 AND "externalId" = '30'`,
      [id],
    );
    expect(row).toEqual({ supplierStatus: 'Enviado', state: 'PENDIENTE' });
    expect(await count('supplier_order_lines')).toBe(2);
  });

  it('reads at most a few order pages each time; the rest wait for the next one', async () => {
    const many = Array.from({ length: MAX_PAGES_PER_SYNC + 3 }, (_, i) => ({
      id: String(100 + i),
      ref: `REFNUEVO${i}`,
    }));
    rows = [...many, ...rows];
    const first = await sync();
    expect(first.body).toMatchObject({
      added: MAX_PAGES_PER_SYNC,
      waiting: 3,
    });
    expect(detailReads()).toBe(MAX_PAGES_PER_SYNC);
    calls = [];
    const second = await sync();
    expect(second.body).toMatchObject({ added: 3, waiting: 0 });
    expect(detailReads()).toBe(3);
  });

  it('if an order page cannot be read, nothing is saved', async () => {
    const before = await count('supplier_orders');
    rows = [
      { id: '500', ref: 'REFBIEN' },
      { id: '501', ref: 'REFMAL' },
      ...rows,
    ];
    broken.add('501');
    const res = await sync();
    expect(res.status).toBe(400);
    expect(res.body.message).toContain(
      'No se leen las líneas del pedido REFMAL',
    );
    expect(res.body.message).toContain('No se ha guardado nada');
    expect(await count('supplier_orders')).toBe(before);
    rows = rows.filter((r) => r.id !== '500' && r.id !== '501');
  });

  it('an empty history after orders were read is a broken place, not «no orders»', async () => {
    const saved = rows;
    rows = [];
    const res = await sync();
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Filas del historial');
    rows = saved;
  });

  it('finds orders by reference, or by a line’s reference or product', async () => {
    const byRef = await get(`/api/supplier-orders?supplierId=${id}&q=treinta`);
    expect(byRef.body.items.map((o: any) => o.reference)).toEqual([
      'REFTREINTA',
    ]);
    const byLine = await get(`/api/supplier-orders?supplierId=${id}&q=pt0002`);
    expect(byLine.body.total).toBe(MAX_PAGES_PER_SYNC + 3 + 1);
    const none = await get(`/api/supplier-orders?supplierId=${id}&q=100%25`);
    expect(none.body.total).toBe(0);
  });

  it('pages of 50, newest first', async () => {
    const res = await get(`/api/supplier-orders?supplierId=${id}`);
    expect(res.body.pageSize).toBe(50);
    expect(res.body.items.at(-1).reference).toBe('REFDIEZ');
    expect(
      (await get(`/api/supplier-orders?supplierId=${id}&page=0`)).status,
    ).toBe(400);
    expect((await get(`/api/supplier-orders?state=PERDIDO`)).status).toBe(400);
  });

  describe('Estado para Kenova', () => {
    let older: string;
    beforeAll(async () => {
      const list = await get(
        `/api/supplier-orders?supplierId=${id}&state=ANTERIOR&q=REFVEINTE`,
      );
      older = list.body.items[0].id;
    });

    it('an order from before the ERP can be made pending: its lines are read then', async () => {
      const res = await send('patch', sa, `/api/supplier-orders/${older}`, {
        state: 'PENDIENTE',
      });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe('PENDIENTE');
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.linesReadAt).toEqual(expect.any(String));
      expect(detailReads()).toBe(1);
      const [audit] = await t.db.query(
        `SELECT metadata FROM audit_events WHERE action = 'SUPPLIER_ORDER_STATE_CHANGED' AND "entityId" = $1`,
        [older],
      );
      expect(audit.metadata).toEqual({
        reference: 'REFVEINTE',
        from: 'ANTERIOR',
        to: 'PENDIENTE',
      });
    });

    it('discards and back, without reading again', async () => {
      const off = await send('patch', sa, `/api/supplier-orders/${older}`, {
        state: 'DESCARTADO',
      });
      expect(off.body.state).toBe('DESCARTADO');
      const back = await send('patch', sa, `/api/supplier-orders/${older}`, {
        state: 'PENDIENTE',
      });
      expect(back.body.state).toBe('PENDIENTE');
      expect(detailReads()).toBe(0);
    });

    it('«Recibido» only comes from receiving the parcel, and a received order stays so', async () => {
      const res = await send('patch', sa, `/api/supplier-orders/${older}`, {
        state: 'RECIBIDO',
      });
      expect(res.status).toBe(400);
      await t.db.query(
        `UPDATE supplier_orders SET state = 'RECIBIDO' WHERE id = $1`,
        [older],
      );
      const change = await send('patch', sa, `/api/supplier-orders/${older}`, {
        state: 'DESCARTADO',
      });
      expect(change.status).toBe(409);
      const read = await send(
        'post',
        sa,
        `/api/supplier-orders/${older}/lines`,
      );
      expect(read.status).toBe(409);
    });

    it('«Leer líneas» reads the order page again', async () => {
      const list = await get(
        `/api/supplier-orders?supplierId=${id}&state=ANTERIOR&q=REFDIEZ`,
      );
      const res = await send(
        'post',
        sa,
        `/api/supplier-orders/${list.body.items[0].id}/lines`,
      );
      expect(res.status).toBe(200);
      expect(res.body.state).toBe('ANTERIOR');
      expect(res.body.lines).toHaveLength(2);
    });
  });

  it('credentials that no longer open (the key changed) are asked for again', async () => {
    const [{ c }] = await t.db.query(
      `SELECT "credentialsCiphertext" AS c FROM suppliers WHERE id = $1`,
      [id],
    );
    await t.db.query(
      `UPDATE suppliers SET "credentialsCiphertext" = $2 WHERE id = $1`,
      [id, c.replace(/:[\w-]+$/, ':AAAAAAAAAAAAAAAAAAAAAA')],
    );
    const res = await sync();
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Vuelve a guardarlas');
    await t.db.query(
      `UPDATE suppliers SET "credentialsCiphertext" = $2 WHERE id = $1`,
      [id, c],
    );
  });

  it('a deactivated supplier is not read', async () => {
    const other = (
      await send('post', sa, '/api/suppliers', { name: 'Épsilon' })
    ).body.id;
    await send('patch', sa, `/api/suppliers/${other}`, { active: false });
    const res = await send('post', sa, `/api/suppliers/${other}/sync`);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('desactivado');
  });

  it('is only for the administrator', async () => {
    expect((await get('/api/supplier-orders', store)).status).toBe(403);
    expect(
      (await send('post', store, `/api/suppliers/${id}/sync`)).status,
    ).toBe(403);
  });
});
