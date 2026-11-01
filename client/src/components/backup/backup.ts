/** POST /api/backup/export. */
export interface BackupExport {
  exportedAt: string;
  tables: {
    name: string;
    columns: string[];
    rows: Record<string, unknown>[];
  }[];
}

/** GET /api/backup/status. */
export interface BackupStatus {
  lastExportAt: string | null;
  by: string | null;
}

/** After this many days without a copy, the screen warns. */
export const STALE_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

/** Whole days since the last copy, or null if there was never one. */
export function daysSince(iso: string | null, now = Date.now()): number | null {
  return iso ? Math.floor((now - Date.parse(iso)) / DAY) : null;
}

/** Whether the copy is missing or older than STALE_DAYS. */
export function isStale(status: BackupStatus, now = Date.now()): boolean {
  const days = daysSince(status.lastExportAt, now);
  return days === null || days > STALE_DAYS;
}

/** «Kenova_copia_2026-11-01.xlsx», with the date in Madrid. */
export function backupFileName(exportedAt: string): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date(exportedAt));
  return `Kenova_copia_${day}.xlsx`;
}

/** Excel refuses longer text in one cell. */
const CELL_MAX = 32767;

/** A database value as a spreadsheet cell: lists and objects as JSON text. */
export function cell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > CELL_MAX ? text.slice(0, CELL_MAX) : text;
}

/** One sheet per table: the column names, then a row per record. */
export function sheetRows(
  table: BackupExport["tables"][number],
): (string | number | boolean | null)[][] {
  return [
    table.columns,
    ...table.rows.map((r) => table.columns.map((c) => cell(r[c]))),
  ];
}
