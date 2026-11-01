/** Design R2 3.10 «Papelera»: what was deleted, to bring it back. */

import { API_URL } from "@/lib/api";

export type TrashKind = "order" | "client" | "part";

/** GET /api/trash. */
export interface TrashItem {
  kind: TrashKind;
  id: string;
  title: string;
  detail: string | null;
  deletedAt: string;
  deletedBy: string | null;
}

export interface TrashPage {
  items: TrashItem[];
  total: number;
}

export const TRASH_PAGE_SIZE = 50;

export const KINDS: [TrashKind, string][] = [
  ["order", "Órdenes"],
  ["client", "Clientes"],
  ["part", "Repuestos"],
];

export const KIND_LABEL: Record<TrashKind, string> = {
  order: "Orden",
  client: "Cliente",
  part: "Repuesto",
};

/** Where a restored item opens. */
export function openHref(item: Pick<TrashItem, "kind" | "id">): string {
  if (item.kind === "order") return `/ordenes?orden=${item.id}`;
  if (item.kind === "client") return `/clientes?cliente=${item.id}`;
  return `/inventario?repuesto=${item.id}`;
}

const day = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

/** «Eliminado el 30/10/2026 por Ana Rojo». */
export function deletedLine(item: TrashItem): string {
  const by = item.deletedBy ? ` por ${item.deletedBy}` : "";
  return `Eliminado el ${day.format(new Date(item.deletedAt))}${by}`;
}

/** «VC-0022 vuelve a Órdenes.» */
export function restoredText(item: TrashItem): string {
  const where = { order: "Órdenes", client: "Clientes", part: "Inventario" }[
    item.kind
  ];
  return `${item.title} vuelve a ${where}.`;
}

/** The API call for the list. */
export function listUrl(
  kind: TrashKind | null,
  q: string,
  page: number,
): string {
  const p = new URLSearchParams();
  if (kind) p.set("kind", kind);
  if (q.trim()) p.set("q", q.trim());
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `${API_URL}/trash${s ? `?${s}` : ""}`;
}
