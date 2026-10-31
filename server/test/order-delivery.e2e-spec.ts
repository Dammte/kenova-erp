import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Order {
  id: string;
  serviceHistory: { action: string; description: string }[];
}

describe('Delivering an order with money owed', () => {
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
  const read = async (id: string) =>
    (
      await t
        .http()
        .get(`/api/service-orders/${id}`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
    ).body as Order;
  const finishedOrder = async (amountPaid: number) => {
    const { id } = (
      await send('post', '/api/service-orders', {
        clientId,
        totalPrice: 149,
        amountPaid,
      })
    ).body as Order;
    await send('patch', `/api/service-orders/${id}`, { status: 'finalizado' });
    return id;
  };

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    clientId = (
      (await send('post', '/api/clients', { firstName: 'Noa' })).body as {
        id: string;
      }
    ).id;
  });
  afterAll(() => t.close());

  it('records the amount owed and why in the history', async () => {
    const id = await finishedOrder(59);
    const res = await send('patch', `/api/service-orders/${id}`, {
      status: 'entregado',
      owedReason: '  Pagará por transferencia mañana ',
    });
    expect(res.status).toBe(200);
    const entry = (await read(id)).serviceHistory.find(
      (h) => h.action === 'entrega_con_saldo',
    );
    expect(entry?.description).toBe(
      'Entregada con 90,00 € pendientes · motivo: Pagará por transferencia mañana',
    );
  });

  it('still records the amount when no reason is given', async () => {
    const id = await finishedOrder(0);
    await send('patch', `/api/service-orders/${id}`, { status: 'entregado' });
    const entry = (await read(id)).serviceHistory.find(
      (h) => h.action === 'entrega_con_saldo',
    );
    expect(entry?.description).toBe('Entregada con 149,00 € pendientes');
  });

  it('adds nothing when the order is paid', async () => {
    const id = await finishedOrder(149);
    await send('patch', `/api/service-orders/${id}`, {
      status: 'entregado',
      owedReason: 'No aplica',
    });
    const actions = (await read(id)).serviceHistory.map((h) => h.action);
    expect(actions).not.toContain('entrega_con_saldo');
  });
});
