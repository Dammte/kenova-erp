/**
 * Reads an amount typed at the counter: "12,5", "12.5", "1.284,50" or
 * "12 €". Returns null when it is not a valid non-negative amount with at most
 * two decimals.
 */
export function parseMoney(text: string): number | null {
  let s = text.replace(/€/g, "").replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    // Spanish style: dots group thousands and the comma marks the decimals.
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.284" is one thousand two hundred, not one euro.
    s = s.replace(/\./g, "");
  } else if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }
  return Math.round(Number(s) * 100) / 100;
}

const amount = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/** An amount for an input, without the currency sign ("1.284,50"). */
export const formatMoneyInput = (value: number): string =>
  amount.format(value);
