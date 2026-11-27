import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Order edits: history and conflicts (design R3 B5)', () => {
  let t: TestContext;
  let cookie: string;
  let clientId: string;

  const send = (
    method: 'post' | 'patch' | 'get',
    url: string,
    body?: object,
  ) => {
    const req = t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
    return body ? req.send(body) : req;
  };
  const newOrder = async () =>
    (
      await send('post', '/api/service-orders', {
        clientId,
        priority: 'medium',
        reportedFaults: ['battery'],
      })
    ).body as { id: string; updatedAt: string };
  const history = async (id: string) =>
    (
      (await send('get', `/api/service-orders/${id}`)).body.serviceHistory as {
        action: string;
        description: string;
      }[]
    )
      .filter((h) => h.action === 'updated')
      .map((h) => h.description);

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    clientId = (await send('post', '/api/clients', { firstName: 'Eva' })).body
      .id;
  });
  afterAll(() => t.close());

  it('leaves each edit in the history, with the old and new value', async () => {
    const o = await newOrder();
    const res = await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'high',
      reportedFaults: ['battery', 'broken_screen'],
      accessories: 'Funda',
      faultNotes: null,
    });
    expect(res.status).toBe(200);
    expect(await history(o.id)).toEqual([
      'Edición · Prioridad: Media → Alta · Avería: Batería → Batería, Pantalla · Accesorios: vacío → Funda',
    ]);
  });

  it('records nothing when nothing changed', async () => {
    const o = await newOrder();
    await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'medium',
      reportedFaults: ['battery'],
    });
    await send('patch', `/api/service-orders/${o.id}`, {
      status: 'en_progreso',
    });
    expect(await history(o.id)).toEqual([]);
  });

  it('refuses an edit made on an outdated copy, so nobody overwrites another change', async () => {
    const o = await newOrder();
    const first = await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'urgent',
      expectedUpdatedAt: o.updatedAt,
    });
    expect(first.status).toBe(200);

    // Someone else, still looking at the order as it was loaded.
    const stale = await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'low',
      expectedUpdatedAt: o.updatedAt,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('ORDER_CHANGED');
    expect(
      (await send('get', `/api/service-orders/${o.id}`)).body.priority,
    ).toBe('urgent');

    // After reloading, with the current version, it goes through.
    const fresh = await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'low',
      expectedUpdatedAt: first.body.updatedAt,
    });
    expect(fresh.status).toBe(200);
  });
});
