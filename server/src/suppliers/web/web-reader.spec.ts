import { readFileSync } from 'fs';
import { join } from 'path';
import { PRESTASHOP_DEFAULTS } from './web-config';
import {
  isLoginPage,
  loginForm,
  parseDate,
  parseMoney,
  readDetail,
  readHistory,
} from './web-reader';

const page = (name: string) =>
  readFileSync(
    join(__dirname, '../../../test/fixtures/prestashop', name),
    'utf8',
  );
const BASE = 'https://b2b.proveedor.test';

describe('reading the supplier pages', () => {
  it('reads Spanish and plain amounts', () => {
    expect(parseMoney('1.106,03 €')).toBe('1106.03');
    expect(parseMoney('20,5 €')).toBe('20.5');
    expect(parseMoney('1234.56')).toBe('1234.56');
    expect(parseMoney('1,234.56')).toBe('1234.56');
    expect(parseMoney('Gratis')).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });

  it('reads dates as AAAA-MM-DD', () => {
    expect(parseDate('25/11/2026')).toBe('2026-11-25');
    expect(parseDate('7-7-2023')).toBe('2023-07-07');
    expect(parseDate('2026-11-25 10:00')).toBe('2026-11-25');
    expect(parseDate('13/13/2026')).toBeNull();
    expect(parseDate('ayer')).toBeNull();
  });

  it('fills the login form like a browser: its hidden fields, the user and the password', () => {
    const form = loginForm(
      page('login.html'),
      `${BASE}/index.php?controller=authentication`,
      PRESTASHOP_DEFAULTS.login,
      { username: 'compras@kenova.test', password: 'secreta' },
    );
    expect(form).toEqual({
      action: `${BASE}/iniciar-sesion?back=history`,
      fields: {
        back: 'history',
        submitLogin: '1',
        email: 'compras@kenova.test',
        password: 'secreta',
      },
    });
    expect(isLoginPage(page('login.html'), 'password')).toBe(true);
    expect(isLoginPage(page('history.html'), 'password')).toBe(false);
  });

  it('says so when there is no login form', () => {
    expect(() =>
      loginForm(page('history.html'), BASE, PRESTASHOP_DEFAULTS.login, {
        username: 'a',
        password: 'b',
      }),
    ).toThrow(/No se encuentra el formulario de inicio de sesión/);
  });

  it('reads every order of the history with its id from the «Datos» link', () => {
    expect(
      readHistory(
        page('history.html'),
        `${BASE}/historial-compra`,
        PRESTASHOP_DEFAULTS.history,
      ),
    ).toEqual([
      {
        externalId: '1001',
        reference: 'ABCDEFGHI',
        date: '2026-11-25',
        total: '1106.03',
        payment: 'Pago con tarjeta',
        status: 'Pago aceptado',
        invoiceUrl: null,
        detailUrl: `${BASE}/index.php?controller=order-detail&id_order=1001`,
      },
      {
        externalId: '998',
        reference: 'JKLMNOPQR',
        date: '2023-07-07',
        total: '16.15',
        payment: 'Pago contra reembolso',
        status: 'Entregado',
        invoiceUrl: `${BASE}/index.php?controller=pdf-invoice&id_order=998`,
        detailUrl: `${BASE}/index.php?controller=order-detail&id_order=998`,
      },
    ]);
  });

  it('reads the lines of an order, leaving the totals out', () => {
    expect(
      readDetail(
        page('order-detail.html'),
        `${BASE}/index.php?controller=order-detail&id_order=1001`,
        PRESTASHOP_DEFAULTS.detail,
      ),
    ).toEqual([
      {
        description: 'Batería para Teléfono X (Original Service Pack)',
        ref: 'BT0001',
        // No link on the page: the shop's search for its reference.
        productUrl: `${BASE}/busqueda?controller=search&s=BT0001`,
        quantity: 2,
        unitPrice: '20.52',
        lineTotal: '41.04',
      },
      {
        description: 'Pantalla para Teléfono Y // Teléfono Z Sin Marco',
        ref: 'PT0002',
        productUrl: `${BASE}/pantallas/77-pantalla-y.html`,
        quantity: 1,
        unitPrice: '1065',
        lineTotal: '1065',
      },
    ]);
  });

  it('names the selector or pattern a person got wrong', () => {
    expect(() =>
      readHistory(page('history.html'), BASE, {
        ...PRESTASHOP_DEFAULTS.history,
        rowSelector: 'tr[',
      }),
    ).toThrow('El selector «tr[» no es válido');
    expect(() =>
      readDetail(page('order-detail.html'), BASE, {
        ...PRESTASHOP_DEFAULTS.detail,
        refPattern: '(',
      }),
    ).toThrow('El patrón de la referencia «(» no es válido');
  });
});
