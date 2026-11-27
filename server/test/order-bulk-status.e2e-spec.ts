import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Result {
  changed: { id: string; code: string }[];
  unchanged: { id: string; code: string }[];
  failed: { id: string; code: string | null; reason: string }[];
}

describe('Bulk status (POST /api/service-orders/bulk-status)', () => {
  let t: TestContext;
  let cookie: string;
  let clientId: string;

  const send = (method: 'post' | 'patch', url: string, body: object) =>
    t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const newOrder = async (status?: string) => {
    const o = (await send('post', '/api/service-orders', { clientId }))
      .body as { id: string; code: string };
    if (status) {
      const res = await send('patch', `/api/service-orders/${o.id}`, {
        status,
      });
      expect(res.status).toBe(200);
    }
    return o;
  };
  const bulk = (body: object) =>
    send('post', '/api/service-orders/bulk-status', body);
  const statusOf = async (id: string) =>
    (
      (await t.http().get(`/api/service-orders/${id}`).set('Cookie', cookie))
        .body as { status: string }
    ).status;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    clientId = (
      (await send('post', '/api/clients', { firstName: 'Lote' })).body as {
        id: string;
      }
    ).id;
  });
  afterAll(() => t.close());

  it('moves every order it can and says why the others did not move', async () => {
    const a = await newOrder('en_progreso');
    const b = await newOrder('pendiente_piezas');
    const same = await newOrder('pendiente_cliente');
    const finished = await newOrder('finalizado');
    const delivered = await newOrder('entregado');
    const missing = '00000000-0000-4000-8000-000000000000';

    const res = await bulk({
      ids: [a.id, b.id, same.id, finished.id, delivered.id, missing],
      status: 'pendiente_cliente',
    });
    expect(res.status).toBe(200);
    const r = res.body as Result;
    expect(r.changed.map((o) => o.code)).toEqual([a.code, b.code]);
    expect(r.unchanged.map((o) => o.code)).toEqual([same.code]);
    expect(r.failed).toEqual([
      {
        id: finished.id,
        code: finished.code,
        reason: 'Está finalizada: solo puede volver a «En progreso»',
      },
      {
        id: delivered.id,
        code: delivered.code,
        reason: 'Está entregada: se reabre desde su ficha',
      },
      { id: missing, code: null, reason: expect.any(String) as string },
    ]);
    expect(await statusOf(a.id)).toBe('pendiente_cliente');
    expect(await statusOf(finished.id)).toBe('finalizado');
    expect(await statusOf(delivered.id)).toBe('entregado');
  });

  it('takes a finished order back to work', async () => {
    const o = await newOrder('finalizado');
    const r = (await bulk({ ids: [o.id], status: 'en_progreso' }))
      .body as Result;
    expect(r.changed).toEqual([{ id: o.id, code: o.code }]);
    const history = (
      await t.http().get(`/api/service-orders/${o.id}`).set('Cookie', cookie)
    ).body as { status: string };
    expect(history.status).toBe('en_progreso');
  });

  it('only takes the statuses the list changes on the spot', async () => {
    const o = await newOrder('en_progreso');
    for (const body of [
      { ids: [o.id], status: 'entregado' },
      { ids: [o.id], status: 'finalizado' },
      { ids: [], status: 'en_progreso' },
      { ids: [o.id, o.id], status: 'en_progreso' },
      { ids: ['no-es-un-id'], status: 'en_progreso' },
    ]) {
      expect((await bulk(body)).status).toBe(400);
    }
    expect(await statusOf(o.id)).toBe('en_progreso');
  });
});
