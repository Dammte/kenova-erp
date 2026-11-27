import { Priority } from './entities/service-order.entity';

/**
 * Design R3 3.4: every edit of the order leaves a line in its history, such as
 * «Edición · Prioridad: Media → Alta». Only the fields people edit by hand;
 * status, money and lines have their own entries.
 */
const PRIORITY: Record<Priority, string> = {
  [Priority.LOW]: 'Baja',
  [Priority.MEDIUM]: 'Media',
  [Priority.HIGH]: 'Alta',
  [Priority.URGENT]: 'Urgente',
};

/** The same names the screens use (client orderList.ts FAULT_LABEL). */
const FAULT: Record<string, string> = {
  broken_screen: 'Pantalla',
  battery: 'Batería',
  charging: 'No carga',
  not_turning_on: 'No enciende',
  liquid_damage: 'Mojado',
  signal: 'Sin señal / WiFi',
  audio: 'Sonido / micrófono',
  camera: 'Cámara',
  slow_performance: 'Lento / software',
  other: 'Otro',
  connectivity: 'Conectividad / carga',
  partial: 'Funciona parcialmente',
  working: 'Funciona bien',
};

const LABEL = {
  priority: 'Prioridad',
  reportedFaults: 'Avería',
  faultNotes: 'Detalle de la avería',
  physicalCondition: 'Estado físico',
  accessories: 'Accesorios',
  observations: 'Observaciones',
} as const;
export type EditedField = keyof typeof LABEL;

const MAX = 60;
const shown = (field: EditedField, value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'vacío';
  if (field === 'priority') return PRIORITY[value as Priority] ?? String(value);
  if (field === 'reportedFaults') {
    const list = (value as string[]).map((f) => FAULT[f] ?? f);
    return list.length ? list.join(', ') : 'vacío';
  }
  const text = String(value);
  return text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text;
};

const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b))
    return (
      [...((a as string[]) ?? [])].sort().join() ===
      [...((b as string[]) ?? [])].sort().join()
    );
  return (a ?? null) === (b ?? null) || ((a ?? '') === '' && (b ?? '') === '');
};

/** «Edición · Prioridad: Media → Alta · Accesorios: vacío → Funda», or null. */
export function describeEdits(
  before: Partial<Record<EditedField, unknown>>,
  changes: Partial<Record<EditedField, unknown>>,
): string | null {
  const parts = (Object.keys(LABEL) as EditedField[])
    .filter(
      (f) =>
        f in changes &&
        changes[f] !== undefined &&
        !same(before[f], changes[f]),
    )
    .map(
      (f) => `${LABEL[f]}: ${shown(f, before[f])} → ${shown(f, changes[f])}`,
    );
  return parts.length ? `Edición · ${parts.join(' · ')}` : null;
}

/** «149,00 €» from cents. */
export const eur = (cents: number): string =>
  `${(cents / 100).toFixed(2).replace('.', ',')} €`;

interface LineSummary {
  description: string;
  cents: number;
  quantity: number;
}

const lineText = (l: LineSummary) =>
  `${l.description}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`;

/**
 * «Edición · Servicios: + Funda · − Ajuste · Pantalla 149,00 € → 139,00 € ·
 * Total: 149,00 € → 139,00 €», or null if the lines did not change. Lines are
 * matched by their text, as people read them.
 */
export function describeLineEdits(
  before: LineSummary[],
  after: LineSummary[],
  totalBefore: number,
  totalAfter: number,
): string | null {
  const left = [...before];
  const parts: string[] = [];
  for (const line of after) {
    const i = left.findIndex((l) => l.description === line.description);
    if (i === -1) {
      parts.push(`+ ${lineText(line)}`);
      continue;
    }
    const [old] = left.splice(i, 1);
    if (old.cents !== line.cents)
      parts.push(`${line.description} ${eur(old.cents)} → ${eur(line.cents)}`);
    if (old.quantity !== line.quantity)
      parts.push(`${line.description} × ${old.quantity} → × ${line.quantity}`);
  }
  for (const old of left) parts.push(`− ${lineText(old)}`);
  if (!parts.length && totalBefore === totalAfter) return null;
  const text = `Edición · Servicios: ${parts.join(' · ') || 'sin cambios'} · Total: ${eur(totalBefore)} → ${eur(totalAfter)}`;
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}
