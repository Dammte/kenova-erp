/**
 * Normalizes a brand/model name typed by a user.
 * All-lowercase input is title-cased ("galaxy s23" -> "Galaxy S23"); input that
 * already has capitals is kept as typed so names like "iPhone 13" or
 * "POCO F5" are not mangled into "Iphone 13" / "Poco F5".
 */
export function normalizeProductName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());
}
