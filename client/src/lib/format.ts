const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** Formats an amount as euros ("25,00 €"). Accepts the string decimals the API returns. */
export const formatEur = (value: number | string | null | undefined): string =>
  eur.format(Number(value ?? 0));

/** The order number people read (MP-0142); the id prefix only for data that predates it. */
export const orderCode = (order: { id: string; code?: string }): string =>
  order.code ?? `#${order.id.substring(0, 8).toUpperCase()}`;

/** Estimated time is free text ("2", "1-2 horas"); only bare numbers get the "h" unit. */
export const formatEstimatedTime = (value: string | number): string => {
  const text = String(value).trim();
  return /^\d+([.,]\d+)?$/.test(text) ? `${text} h` : text;
};
