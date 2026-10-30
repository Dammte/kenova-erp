import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Order lifecycle dates and cancel reason', () => {
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
  const newOrder = async () =>
    (await send('post', '/api/service-orders', { clientId })).body as {
      id: string;
    };
  const setStatus = async (id: string, body: object) => {
    const res = await send('patch', `/api/service-orders/${id}`, body);
    expect(res.status).toBe(200);
    return res.body as {
      finishedAt: string | null;
      deliveredAt: string | null;
      cancelReason: string | null;
    };
  };

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    clientId = (await send('post', '/api/clients', { firstName: 'Eva' })).body
      .id;
  });
  afterAll(() => t.close());

  it('records when an order is finished and when it is delivered', async () => {
    const o = await newOrder();
    const finished = await setStatus(o.id, { status: 'finalizado' });
    expect(finished.finishedAt).not.toBeNull();
    expect(finished.deliveredAt).toBeNull();

    const delivered = await setStatus(o.id, { status: 'entregado' });
    expect(delivered.finishedAt).toBe(finished.finishedAt);
    expect(delivered.deliveredAt).not.toBeNull();
  });

  it('a delivery straight from the workshop sets both dates', async () => {
    const o = await newOrder();
    const res = await setStatus(o.id, { status: 'entregado' });
    expect(res.finishedAt).not.toBeNull();
    expect(res.deliveredAt).toBe(res.finishedAt);
  });

  it('reopening an order clears its dates', async () => {
    const o = await newOrder();
    await setStatus(o.id, { status: 'entregado' });
    const back = await setStatus(o.id, { status: 'finalizado' });
    expect(back.finishedAt).not.toBeNull();
    expect(back.deliveredAt).toBeNull();
    const reopened = await setStatus(o.id, { status: 'en_progreso' });
    expect(reopened.finishedAt).toBeNull();
    expect(reopened.deliveredAt).toBeNull();
  });

  it('the dates cannot be written by the client', async () => {
    const o = await newOrder();
    const res = await setStatus(o.id, {
      finishedAt: '2020-01-01T00:00:00Z',
      deliveredAt: '2020-01-01T00:00:00Z',
    });
    expect(res.finishedAt).toBeNull();
    expect(res.deliveredAt).toBeNull();
  });

  it('keeps the cancel reason only while the order is cancelled', async () => {
    const o = await newOrder();
    const cancelled = await setStatus(o.id, {
      status: 'cancelado',
      cancelReason: '  El cliente no acepta el presupuesto ',
    });
    expect(cancelled.cancelReason).toBe('El cliente no acepta el presupuesto');

    const reopened = await setStatus(o.id, { status: 'en_progreso' });
    expect(reopened.cancelReason).toBeNull();

    const ignored = await setStatus(o.id, { cancelReason: 'No aplica' });
    expect(ignored.cancelReason).toBeNull();

    const tooLong = await send('patch', `/api/service-orders/${o.id}`, {
      status: 'cancelado',
      cancelReason: 'x'.repeat(301),
    });
    expect(tooLong.status).toBe(400);
  });
});
