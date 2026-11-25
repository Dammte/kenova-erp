/** «Configuración › Proveedores»: the companies Kenova buys parts from. */
import type { SupplierConnection } from "./connection";

/** GET /api/suppliers. */
export interface SupplierData {
  id: string;
  name: string;
  taxId: string | null;
  customerNumber: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  active: boolean;
  connection: SupplierConnection | null;
  /** When the website login was saved; null = none. The login itself never comes. */
  credentialsUpdatedAt: string | null;
}

type Field = Exclude<keyof SupplierData, "id" | "active" | "connection" | "credentialsUpdatedAt">;

/** The form's fields, as typed. */
export type SupplierDraft = Record<Field, string>;
export type SupplierErrors = Partial<SupplierDraft>;

const FIELDS: Field[] = [
  "name",
  "taxId",
  "customerNumber",
  "contactName",
  "email",
  "phone",
  "website",
  "notes",
];

export const emptySupplier = (): SupplierDraft =>
  Object.fromEntries(FIELDS.map((f) => [f, ""])) as SupplierDraft;

export const supplierDraftFrom = (s: SupplierData): SupplierDraft =>
  Object.fromEntries(FIELDS.map((f) => [f, s[f] ?? ""])) as SupplierDraft;

/** The same rules the server applies, so mistakes show next to the field. */
export function validateSupplier(d: SupplierDraft): SupplierErrors {
  const e: SupplierErrors = {};
  if (d.name.trim().length < 2) e.name = "Escribe el nombre del proveedor";
  const cif = d.taxId.replace(/[\s-]/g, "");
  if (cif && !/^[A-Za-z0-9]{8,15}$/.test(cif)) e.taxId = "CIF no válido";
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = "Email no válido";
  if (d.phone.trim() && !/^\+?[\d\s]{6,20}$/.test(d.phone.trim())) e.phone = "Teléfono no válido";
  if (d.website.trim() && !/^https?:\/\/\S+\.\S+/.test(d.website.trim())) e.website = "La web debe empezar por https://";
  return e;
}

/** What to send: every field to create, only the changed ones to edit. */
export function supplierBody(d: SupplierDraft, original?: SupplierDraft): Record<string, string> {
  return Object.fromEntries(
    FIELDS.filter((f) => !original || d[f].trim() !== original[f].trim()).map((f) => [f, d[f].trim()]),
  );
}

/** «Ane · 944 000 000 · nº cliente C-1042», what the list shows under the name. */
export function supplierSummary(s: SupplierData): string {
  return [s.contactName, s.phone ?? s.email, s.customerNumber && `nº cliente ${s.customerNumber}`]
    .filter(Boolean)
    .join(" · ");
}
