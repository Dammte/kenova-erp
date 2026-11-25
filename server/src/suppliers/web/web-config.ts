/**
 * How the ERP reads a supplier's orders from the pages of its website.
 *
 * Every address and every place a value is taken from is data, edited by the
 * administrator in «Proveedores», so a change on the supplier's website (or a
 * new supplier) is fixed there and not in code. Places are CSS selectors.
 */
export interface SupplierWebConfig {
  kind: 'html';
  /** https://host — the only host the ERP calls for this supplier. */
  baseUrl: string;
  login: {
    /** The page with the login form. */
    path: string;
    /** Names of the form's inputs. */
    userField: string;
    passwordField: string;
  };
  history: {
    /** The page listing every order. */
    path: string;
    /** One order per match. */
    rowSelector: string;
    /** Inside a row. */
    referenceSelector: string;
    dateSelector: string;
    totalSelector: string;
    paymentSelector: string | null;
    statusSelector: string | null;
    /** A link to the invoice (PDF), when the supplier gives one. */
    invoiceLinkSelector: string | null;
    /** The link to the order's page; the order's id is taken from it. */
    detailLinkSelector: string;
    /** Regular expression with one group: the id inside that link. */
    idPattern: string;
  };
  detail: {
    /** The order's page, with {id}. */
    path: string;
    /** One line per match. */
    rowSelector: string;
    productSelector: string;
    /** Where the supplier's reference is, when the page shows it. */
    refSelector: string | null;
    /** Regular expression with one group, when the reference shares its place with other text. */
    refPattern: string | null;
    /** A link to the product in the supplier's shop. */
    productLinkSelector: string | null;
    /** Without a link: the shop's search, with {ref}. */
    productSearchPath: string | null;
    quantitySelector: string;
    unitPriceSelector: string;
    lineTotalSelector: string | null;
  };
}

/**
 * The places of a PrestaShop 1.7 shop («classic» theme), checked against the
 * pages of rphoneb2b.com (PrestaShop 1.7.6). Proposed for a new connection;
 * each one can be changed after «Probar conexión».
 */
export const PRESTASHOP_DEFAULTS: Omit<SupplierWebConfig, 'baseUrl'> = {
  kind: 'html',
  login: {
    path: '/iniciar-sesion',
    userField: 'email',
    passwordField: 'password',
  },
  history: {
    path: '/historial-compra',
    rowSelector: '#content table tbody tr',
    referenceSelector: 'th',
    dateSelector: 'td:nth-of-type(1)',
    totalSelector: 'td:nth-of-type(2)',
    paymentSelector: 'td:nth-of-type(3)',
    statusSelector: 'td:nth-of-type(4)',
    invoiceLinkSelector: 'a[href*="pdf-invoice"]',
    detailLinkSelector: 'a[href*="order-detail"]',
    idPattern: 'id_order=(\\d+)',
  },
  detail: {
    path: '/index.php?controller=order-detail&id_order={id}',
    rowSelector: '#order-products tbody tr',
    productSelector: 'td:nth-of-type(1) strong',
    refSelector: 'td:nth-of-type(1)',
    refPattern: 'Referencia:\\s*(\\S+)',
    productLinkSelector: 'td:nth-of-type(1) a',
    productSearchPath: '/busqueda?controller=search&s={ref}',
    quantitySelector: 'td:nth-of-type(2)',
    unitPriceSelector: 'td:nth-of-type(3)',
    lineTotalSelector: 'td:nth-of-type(4)',
  },
};
