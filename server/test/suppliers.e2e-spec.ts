import { readFileSync } from 'fs';
import { join } from 'path';
import { PRESTASHOP_DEFAULTS } from '../src/suppliers/web/web-config';
import { SupplierWebService } from '../src/suppliers/web/supplier-web.service';
import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Proveedores', () => {
  let t: TestContext;
  let sa: string;
  let store: string;

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

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
  });
  afterAll(() => t.close());

  it('creates a supplier with its company data, tidied', async () => {
    const res = await send('post', sa, '/api/suppliers', {
      name: '  Repuestos   Norte ',
      taxId: 'b-12345678',
      customerNumber: ' C-1042 ',
      contactName: 'Ane',
      email: 'pedidos@norte.test',
      phone: '+34 944 000 000',
      website: 'https://norte.test',
      notes: '',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Repuestos Norte',
      taxId: 'B12345678',
      customerNumber: 'C-1042',
      notes: null,
      active: true,
    });
    const audit = await t.db.query(
      `SELECT action FROM audit_events WHERE "entityId" = $1`,
      [res.body.id],
    );
    expect(audit).toEqual([{ action: 'SUPPLIER_CREATED' }]);
  });

  it('refuses the same name in other capitals', async () => {
    const res = await send('post', sa, '/api/suppliers', {
      name: 'repuestos norte',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Ya existe un proveedor «repuestos norte»');
  });

  it('validates the email, the web and the CIF', async () => {
    const res = await send('post', sa, '/api/suppliers', {
      name: 'Otro',
      email: 'no-es-email',
      website: 'norte.test',
      taxId: '12',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'Email no válido',
        'La web debe empezar por https://',
        'CIF no válido',
      ]),
    );
  });

  it('edits and deactivates; inactive ones are listed last', async () => {
    const a = (await send('post', sa, '/api/suppliers', { name: 'Alfa' })).body
      .id;
    const edited = await send('patch', sa, `/api/suppliers/${a}`, {
      phone: '600 111 222',
      active: false,
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ phone: '600 111 222', active: false });
    const list = await t.http().get('/api/suppliers').set('Cookie', sa);
    expect(list.body.map((s: { name: string }) => s.name)).toEqual([
      'Repuestos Norte',
      'Alfa',
    ]);
  });

  it('renaming onto another supplier is refused', async () => {
    const b = (await send('post', sa, '/api/suppliers', { name: 'Beta' })).body
      .id;
    const res = await send('patch', sa, `/api/suppliers/${b}`, {
      name: 'ALFA',
    });
    expect(res.status).toBe(409);
  });

  it('is only for the administrator', async () => {
    expect(
      (await t.http().get('/api/suppliers').set('Cookie', store)).status,
    ).toBe(403);
    expect(
      (await send('post', store, '/api/suppliers', { name: 'Tienda' })).status,
    ).toBe(403);
  });

  describe('Conexión con la web del proveedor', () => {
    let id: string;
    const CONNECTION = {
      ...PRESTASHOP_DEFAULTS,
      baseUrl: 'https://b2b.proveedor.test/',
    };
    beforeAll(async () => {
      id = (await send('post', sa, '/api/suppliers', { name: 'Gamma' })).body
        .id;
    });

    it('saves the pages and the places of each value, tidied', async () => {
      const res = await send('put', sa, `/api/suppliers/${id}/connection`, {
        ...CONNECTION,
        history: { ...CONNECTION.history, paymentSelector: '  ' },
      });
      expect(res.status).toBe(200);
      expect(res.body.connection).toEqual({
        ...CONNECTION,
        baseUrl: 'https://b2b.proveedor.test',
        history: { ...CONNECTION.history, paymentSelector: null },
      });
    });

    it('refuses another address, plain http, pages that leave the host and broken places', async () => {
      const res = await send('put', sa, `/api/suppliers/${id}/connection`, {
        ...CONNECTION,
        baseUrl: 'http://b2b.proveedor.test/api',
        login: { ...CONNECTION.login, path: '//evil.test/x' },
        history: {
          ...CONNECTION.history,
          path: '/a/../admin',
          rowSelector: 'tr[',
          idPattern: 'id_order=\\d+',
        },
        detail: {
          ...CONNECTION.detail,
          path: '/pedido',
          productSearchPath: '/busqueda',
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'Dirección base: solo https:// y el dominio, sin rutas (https://b2b.proveedor.es)',
          'login.Página de inicio de sesión: debe empezar por /',
          'history.Página del historial: no puede llevar «..»',
          'history.Filas del historial: no es un selector válido',
          'history.Patrón del id: una expresión con un solo grupo, por ejemplo id_order=(\\d+)',
          'detail.Página del pedido: tiene que llevar {id}',
          'detail.Búsqueda del producto: tiene que llevar {ref}',
        ]),
      );
    });

    it('keeps the login encrypted and never sends it back', async () => {
      const res = await send('put', sa, `/api/suppliers/${id}/credentials`, {
        username: ' compras@kenova.test ',
        password: 'S3creta!',
      });
      expect(res.status).toBe(200);
      expect(res.body.credentialsUpdatedAt).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toContain('S3creta');
      expect(JSON.stringify(res.body)).not.toContain('credentialsCiphertext');
      const [row] = await t.db.query(
        `SELECT "credentialsCiphertext" AS c FROM suppliers WHERE id = $1`,
        [id],
      );
      expect(row.c).toMatch(/^[\w-]+:[\w-]+:[\w-]+:[\w-]+$/);
      expect(row.c).not.toContain('S3creta');
      const list = await t.http().get('/api/suppliers').set('Cookie', sa);
      expect(JSON.stringify(list.body)).not.toContain(row.c);
    });

    it('the server can open it, only for that supplier', async () => {
      const { SuppliersService } = await import(
        '../src/suppliers/suppliers.service'
      );
      const service = t.app.get(SuppliersService);
      expect(await service.credentials(id)).toEqual({
        username: 'compras@kenova.test',
        password: 'S3creta!',
      });
      const other = (
        await send('post', sa, '/api/suppliers', { name: 'Delta' })
      ).body.id;
      await t.db.query(
        `UPDATE suppliers SET "credentialsCiphertext" =
           (SELECT "credentialsCiphertext" FROM suppliers WHERE id = $1)
         WHERE id = $2`,
        [id, other],
      );
      await expect(service.credentials(other)).rejects.toThrow();
    });

    describe('Probar conexión', () => {
      const page = (name: string) =>
        readFileSync(join(__dirname, 'fixtures/prestashop', name), 'utf8');
      const BASE = 'https://b2b.proveedor.test';
      let calls: { method: string; url: string; body?: string }[];
      let loggedIn: boolean;

      /** A fake rphoneb2b: the login page, the form, the history and one order. */
      const fakeSite =
        (password: string) => async (url: string, init: RequestInit) => {
          const u = new URL(url);
          calls.push({ method: init.method!, url, body: init.body as string });
          const cookie = (init.headers as Record<string, string>).Cookie ?? '';
          if (u.pathname === '/iniciar-sesion' && init.method === 'POST') {
            loggedIn =
              new URLSearchParams(init.body as string).get('password') ===
              password;
            return new Response(null, {
              status: 302,
              headers: {
                location: loggedIn
                  ? '/historial-compra'
                  : '/index.php?controller=authentication',
                'set-cookie': `PS=${loggedIn ? 'in' : 'out'}; path=/`,
              },
            });
          }
          if (u.searchParams.get('controller') === 'authentication') {
            return new Response(page('login.html'), {
              headers: { 'set-cookie': 'PS=out; path=/' },
            });
          }
          if (cookie !== 'PS=in') return new Response(page('login.html'));
          if (u.pathname === '/historial-compra')
            return new Response(page('history.html'));
          if (u.searchParams.get('controller') === 'order-detail') {
            return new Response(page('order-detail.html'));
          }
          return new Response('no', { status: 404 });
        };

      beforeEach(() => {
        calls = [];
        loggedIn = false;
        t.app.get(SupplierWebService).sessionOptions = {
          fetcher: fakeSite('S3creta!'),
          resolver: async () => ['203.0.113.10'],
        };
      });

      it('logs in, reads the history and the first order, and saves nothing', async () => {
        const before = await t.db.query(
          `SELECT count(*)::int AS n FROM suppliers`,
        );
        const res = await send('post', sa, `/api/suppliers/${id}/test`);
        expect(res.status).toBe(200);
        expect(res.body.ordersFound).toBe(2);
        expect(res.body.orders[0]).toMatchObject({
          externalId: '1001',
          reference: 'ABCDEFGHI',
          date: '2026-11-25',
          total: '1106.03',
          status: 'Pago aceptado',
        });
        expect(res.body.sample.lines).toHaveLength(2);
        expect(res.body.sample.lines[0]).toMatchObject({
          ref: 'BT0001',
          quantity: 2,
          unitPrice: '20.52',
        });
        expect(res.body.warnings).toEqual([]);
        // Only reads: the one thing sent is the login form.
        expect(
          calls.filter((c) => c.method !== 'GET').map((c) => c.url),
        ).toEqual([`${BASE}/iniciar-sesion?back=history`]);
        expect(calls.every((c) => c.url.startsWith(`${BASE}/`))).toBe(true);
        expect(
          await t.db.query(`SELECT count(*)::int AS n FROM suppliers`),
        ).toEqual(before);
      });

      it('says so when the website refuses the password', async () => {
        t.app.get(SupplierWebService).sessionOptions.fetcher = fakeSite('otra');
        const res = await send('post', sa, `/api/suppliers/${id}/test`);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe(
          'La web del proveedor no ha aceptado el usuario y la contraseña.',
        );
      });

      it('warns when the places find nothing', async () => {
        await send('put', sa, `/api/suppliers/${id}/connection`, {
          ...CONNECTION,
          history: { ...CONNECTION.history, rowSelector: 'table.otra tr' },
        });
        const res = await send('post', sa, `/api/suppliers/${id}/test`);
        expect(res.status).toBe(200);
        expect(res.body.ordersFound).toBe(0);
        expect(res.body.warnings[0]).toMatch(
          /No se ha encontrado ningún pedido/,
        );
        await send('put', sa, `/api/suppliers/${id}/connection`, CONNECTION);
      });

      it('needs a saved connection and credentials', async () => {
        const bare = (
          await send('post', sa, '/api/suppliers', { name: 'Épsilon' })
        ).body.id;
        const res = await send('post', sa, `/api/suppliers/${bare}/test`);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe(
          'Rellena y guarda antes la conexión con su web.',
        );
        await send('put', sa, `/api/suppliers/${bare}/connection`, CONNECTION);
        expect(
          (await send('post', sa, `/api/suppliers/${bare}/test`)).body.message,
        ).toBe('Guarda antes las credenciales de su web.');
      });
    });

    it('deletes the login', async () => {
      const res = await send('delete', sa, `/api/suppliers/${id}/credentials`);
      expect(res.status).toBe(200);
      expect(res.body.credentialsUpdatedAt).toBeNull();
      const audit = await t.db.query(
        `SELECT action FROM audit_events WHERE "entityId" = $1 ORDER BY "createdAt"`,
        [id],
      );
      expect(audit.map((a: { action: string }) => a.action)).toEqual([
        'SUPPLIER_CREATED',
        'SUPPLIER_CONNECTION_UPDATED',
        'SUPPLIER_CREDENTIALS_SET',
        'SUPPLIER_WEB_TESTED',
        'SUPPLIER_CONNECTION_UPDATED',
        'SUPPLIER_WEB_TESTED',
        'SUPPLIER_CONNECTION_UPDATED',
        'SUPPLIER_CREDENTIALS_CLEARED',
      ]);
    });

    it('is only for the administrator', async () => {
      expect(
        (
          await send('put', store, `/api/suppliers/${id}/credentials`, {
            username: 'a',
            password: 'b',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await send(
            'put',
            store,
            `/api/suppliers/${id}/connection`,
            CONNECTION,
          )
        ).status,
      ).toBe(403);
    });
  });
});
