/** What the AI read from an invoice, ready for the review step. */
export interface ReadInvoice {
  provider: string | null;
  number: string | null;
  invoiceDate: string | null;
  lines: {
    description: string;
    ref: string | null;
    quantity: number;
    unitCost: string;
  }[];
}

export type InvoiceFileType = 'application/pdf' | 'image/jpeg' | 'image/png';

/** The type by the file's first bytes, never by what the browser declared. */
export function invoiceFileType(buffer: Buffer): InvoiceFileType | null {
  if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
    return 'application/pdf';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return 'image/jpeg';
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  return null;
}

export const READ_PROMPT = `Eres un sistema que lee facturas de proveedores de repuestos de móviles, tablets y ordenadores para un taller de reparación.

Lee el documento adjunto (factura, albarán o pedido; PDF o foto) y devuelve SOLO un objeto JSON con esta forma exacta:
{"provider":"<nombre del proveedor o null>","number":"<número de factura o null>","date":"<AAAA-MM-DD o null>","lines":[{"description":"<texto de la línea tal cual>","ref":"<referencia del proveedor o null>","quantity":<entero>,"unitCost":<número>}]}

Reglas:
1. "provider" es quien VENDE (el emisor de la factura), no el cliente.
2. Una entrada en "lines" por cada línea de producto físico, en el orden de la factura. Excluye mano de obra, portes, envío, IVA, recargos, descuentos generales, subtotales y totales.
3. "description" copia el texto de la línea tal como aparece, sin traducir ni completar.
4. "ref" es el código o referencia del artículo del proveedor; null si no hay.
5. "unitCost" es el precio de UNA unidad SIN IVA, después del descuento de esa línea. Si solo hay importe de línea: importe / cantidad.
6. Números europeos: "1.234,56" es 1234.56.
7. Si no hay productos: "lines": [].`;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s && s.toLowerCase() !== 'null' ? s.slice(0, max) : null;
};

/** A number written either way: 1234.56, "1.234,56" or "18,50". */
export function euroNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = v.replace(/[€\s]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))
    return Number(s.replace(/\./g, '').replace(',', '.'));
  return Number(s.replace(',', '.'));
}

/** The model's answer, checked line by line; anything unreadable is dropped. */
export function parseInvoice(raw: string): ReadInvoice | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }
  // An older answer shape: just the lines.
  const body = (Array.isArray(data) ? { lines: data } : data) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== 'object' || !Array.isArray(body.lines))
    return null;
  const date = text(body.date, 10);
  const lines = (body.lines as Record<string, unknown>[]).flatMap((l) => {
    if (!l || typeof l !== 'object') return [];
    const description = text(l.description ?? l.name, 150);
    const quantity = Math.round(euroNumber(l.quantity));
    const cost = euroNumber(l.unitCost ?? l.unitPrice);
    if (!description || !(quantity >= 1) || !(cost >= 0) || cost >= 1e8)
      return [];
    return [
      {
        description,
        ref: text(l.ref ?? l.sku, 40),
        quantity: Math.min(quantity, 100_000),
        unitCost: String(Number(cost.toFixed(4))),
      },
    ];
  });
  return {
    provider: text(body.provider, 50),
    number: text(body.number, 40),
    invoiceDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    lines,
  };
}
