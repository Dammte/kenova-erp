import { load, type CheerioAPI, type contains } from 'cheerio';

import type { SupplierWebConfig } from './web-config';
import { SupplierWebError } from './web-error';

/** A node of a parsed page, as cheerio hands them out. */
type Node = Parameters<typeof contains>[0];

/** An order as listed in the supplier's purchase history. */
export interface WebOrder {
  /** The supplier's id for the order (from the link to its page). */
  externalId: string;
  reference: string;
  /** AAAA-MM-DD, or null when the date is not readable. */
  date: string | null;
  /** «1234.56», or null. */
  total: string | null;
  payment: string | null;
  status: string | null;
  invoiceUrl: string | null;
  detailUrl: string;
}

/** A line of an order's page. */
export interface WebOrderLine {
  description: string;
  ref: string | null;
  productUrl: string | null;
  quantity: number | null;
  unitPrice: string | null;
  lineTotal: string | null;
}

/** For an input's name inside [name="…"]. */
const quoted = (name: string) => name.replace(/["\\]/g, '\\$&');

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** «1.234,56 €», «1234.56», «12,5» → «1234.56» / «12.5»; null when it is not an amount. */
export function parseMoney(text: string | null): string | null {
  if (!text) return null;
  let t = text.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(t)) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? String(Math.round(n * 10000) / 10000) : null;
}

/** «25/11/2026», «25-11-2026», «2026-11-25» → «2026-11-25». */
export function parseDate(text: string | null): string | null {
  if (!text) return null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const es = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(text);
  if (!es) return null;
  const [, d, m, y] = es;
  if (Number(m) > 12 || Number(d) > 31) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const parseQuantity = (text: string | null): number | null => {
  const m = text ? /\d+/.exec(text.replace(/\./g, '')) : null;
  return m ? Number(m[0]) : null;
};

/** A selector a person typed: an error that names it instead of a crash. */
function select($: CheerioAPI, root: Node | null, selector: string) {
  try {
    return root ? $(root).find(selector) : $(selector);
  } catch {
    throw new SupplierWebError(`El selector «${selector}» no es válido`);
  }
}

const textOf = ($: CheerioAPI, row: Node, selector: string | null) => {
  if (!selector) return null;
  const found = select($, row, selector).first();
  return found.length ? clean(found.text()) || null : null;
};

const linkOf = (
  $: CheerioAPI,
  row: Node,
  selector: string | null,
  base: string,
) => {
  if (!selector) return null;
  const found = select($, row, selector).first();
  const node = found.is('a') ? found : found.find('a').first();
  const href = node.attr('href');
  if (!href || /^(javascript|mailto):/i.test(href)) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

/** Whether the page asks for the login again (wrong password or session lost). */
export function isLoginPage(html: string, passwordField: string): boolean {
  const $ = load(html);
  return $(`input[name="${quoted(passwordField)}"]`).length > 0;
}

/**
 * The login form as a browser would send it: its hidden inputs and the
 * submit button, plus the user and the password.
 */
export function loginForm(
  html: string,
  pageUrl: string,
  config: SupplierWebConfig['login'],
  credentials: { username: string; password: string },
): { action: string; fields: Record<string, string> } {
  const $ = load(html);
  const password = $(`input[name="${quoted(config.passwordField)}"]`).first();
  const form = password.closest('form');
  if (!form.length) {
    throw new SupplierWebError(
      `No se encuentra el formulario de inicio de sesión (un campo «${config.passwordField}» dentro de un formulario).`,
    );
  }
  const fields: Record<string, string> = {};
  form.find('input[type="hidden"][name]').each((_, el) => {
    fields[$(el).attr('name')!] = $(el).attr('value') ?? '';
  });
  const submit = form
    .find('button[type="submit"][name], input[type="submit"][name]')
    .first();
  if (submit.length) fields[submit.attr('name')!] = submit.attr('value') ?? '1';
  fields[config.userField] = credentials.username;
  fields[config.passwordField] = credentials.password;
  const action = form.attr('action') || pageUrl;
  return { action: new URL(action, pageUrl).toString(), fields };
}

/** Every order of the purchase history page. */
export function readHistory(
  html: string,
  pageUrl: string,
  config: SupplierWebConfig['history'],
): WebOrder[] {
  const $ = load(html);
  let idPattern: RegExp;
  try {
    idPattern = new RegExp(config.idPattern);
  } catch {
    throw new SupplierWebError(
      `El patrón del id «${config.idPattern}» no es válido`,
    );
  }
  const orders: WebOrder[] = [];
  for (const row of select($, null, config.rowSelector).toArray()) {
    const detailUrl = linkOf($, row, config.detailLinkSelector, pageUrl);
    const externalId = detailUrl ? idPattern.exec(detailUrl)?.[1] : undefined;
    const reference = textOf($, row, config.referenceSelector);
    if (!detailUrl || !externalId || !reference) continue;
    orders.push({
      externalId,
      reference,
      date: parseDate(textOf($, row, config.dateSelector)),
      total: parseMoney(textOf($, row, config.totalSelector)),
      payment: textOf($, row, config.paymentSelector),
      status: textOf($, row, config.statusSelector),
      invoiceUrl: linkOf($, row, config.invoiceLinkSelector, pageUrl),
      detailUrl,
    });
  }
  return orders;
}

/** A pattern a person typed, with one group: an error that names it instead of a crash. */
function pattern(source: string, label: string): RegExp {
  try {
    return new RegExp(source);
  } catch {
    throw new SupplierWebError(
      `El patrón de ${label} «${source}» no es válido`,
    );
  }
}

/** The lines of one order's page (rows without a product, like totals, are left out). */
export function readDetail(
  html: string,
  pageUrl: string,
  config: SupplierWebConfig['detail'],
): WebOrderLine[] {
  const $ = load(html);
  const refPattern = config.refPattern
    ? pattern(config.refPattern, 'la referencia')
    : null;
  const lines: WebOrderLine[] = [];
  for (const row of select($, null, config.rowSelector).toArray()) {
    const description = textOf($, row, config.productSelector);
    const quantity = parseQuantity(textOf($, row, config.quantitySelector));
    if (!description || quantity === null) continue;
    const refText = textOf($, row, config.refSelector);
    const ref =
      (refPattern ? refText && refPattern.exec(refText)?.[1] : refText)?.slice(
        0,
        40,
      ) ?? null;
    lines.push({
      description: description.slice(0, 150),
      ref,
      productUrl:
        linkOf($, row, config.productLinkSelector, pageUrl) ??
        (ref && config.productSearchPath
          ? new URL(
              config.productSearchPath.replace(
                '{ref}',
                encodeURIComponent(ref),
              ),
              pageUrl,
            ).toString()
          : null),
      quantity,
      unitPrice: parseMoney(textOf($, row, config.unitPriceSelector)),
      lineTotal: parseMoney(textOf($, row, config.lineTotalSelector)),
    });
  }
  return lines;
}
