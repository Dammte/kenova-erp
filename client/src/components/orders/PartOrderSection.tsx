"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import styles from "./OrderPanel.module.css";

/** GET /api/part-orders?orderId=, the fields the order panel reads. */
export interface OrderPartLine {
  id: string;
  inventoryId: string | null;
  partName: string;
  provider: string | null;
  quantity: number;
  expectedAt: string | null;
  receivedAt: string | null;
  waitingDays: number;
  late: boolean;
}

/** GET /api/inventory, the fields the form reads. */
interface StockPart {
  id: string;
  sku: string;
  name: string;
  stock: number | null;
  provider: string | null;
}

const SHOWN = 6;
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Today in Spain, as the date input wants it. */
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

/** «MovilParts · llega 31/10», «llegaba 30/10 · retrasada», «recibida 30/10». */
export function partState(p: OrderPartLine): string {
  const who = p.provider ? `${p.provider} · ` : "";
  if (p.receivedAt) return `${who}recibida ${day(p.receivedAt)}`;
  if (!p.expectedAt) return `${who}pedida hace ${p.waitingDays} ${p.waitingDays === 1 ? "día" : "días"}${p.late ? " · retrasada" : ""}`;
  return p.late ? `${who}llegaba ${day(p.expectedAt)} · retrasada` : `${who}llega ${day(p.expectedAt)}`;
}

/** The parts ordered for an order (partners only; a store gets none). */
export function usePartOrders(orderId: string, enabled: boolean, reload: unknown): OrderPartLine[] | null {
  const [rows, setRows] = useState<OrderPartLine[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiFetch(`${API_URL}/part-orders?orderId=${orderId}`, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = res.ok ? await res.json() : [];
        setRows(Array.isArray(body) ? (body as OrderPartLine[]) : []);
      })
      .catch(() => !controller.signal.aborted && setRows([]));
    return () => controller.abort();
  }, [orderId, enabled, reload]);
  return enabled ? rows : null;
}

/** Each part ordered for the order, with «Marcar recibido» while it is on its way. */
export function PartOrderList({ rows, onReceived }: { rows: OrderPartLine[]; onReceived: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const receive = async (id: string) => {
    setBusy(id);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/part-orders/${id}/receive`, { method: "POST" });
      if (!res.ok) setProblem(await errorMessage(res, "No se ha podido marcar como recibida."));
      onReceived();
    } catch {
      setProblem("No se ha podido marcar como recibida: se ha perdido la conexión.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ul className={styles.lines} aria-label="Piezas pedidas">
        {rows.map((p) => (
          <li key={p.id}>
            <span>
              {p.partName}
              {p.quantity > 1 ? ` × ${p.quantity}` : ""}
              <span className={p.late ? styles.error : styles.muted}> · {partState(p)}</span>
            </span>
            {!p.receivedAt && (
              <Button size="sm" loading={busy === p.id} onClick={() => receive(p.id)}>
                Marcar recibida
              </Button>
            )}
          </li>
        ))}
      </ul>
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
    </>
  );
}

/**
 * Design 3.4 «Pasar a Pendiente de piezas»: what is missing, from whom and
 * when it arrives. A stock part refills its stock when received.
 */
export function PartOrderForm({
  orderId,
  movesStatus,
  onCancel,
  onDone,
}: {
  orderId: string;
  /** The order is not in «Pendiente de piezas» yet: creating moves it there. */
  movesStatus: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [parts, setParts] = useState<StockPart[] | null>(null);
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<StockPart | null>(null);
  const [provider, setProvider] = useState("");
  const [expected, setExpected] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/inventory`, { signal: controller.signal })
      .then(async (res) => setParts(res.ok ? ((await res.json()) as StockPart[]) : []))
      .catch(() => !controller.signal.aborted && setParts([]));
    return () => controller.abort();
  }, []);

  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (!q || !parts || part) return [];
    return parts.filter((p) => fold(p.name).includes(q) || fold(p.sku).includes(q)).slice(0, SHOWN);
  }, [query, parts, part]);

  const choose = (p: StockPart) => {
    setPart(p);
    setQuery("");
    if (!provider.trim() && p.provider) setProvider(p.provider);
  };

  const missing = !part && !query.trim() ? "Indica la pieza que falta." : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/part-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          ...(part ? { inventoryId: part.id } : { partName: query.trim() }),
          provider: provider.trim() || null,
          quantity,
          expectedAt: expected || null,
        }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido crear el pedido."));
        return;
      }
      onDone();
    } catch {
      setProblem("No se ha podido crear el pedido: se ha perdido la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.finish} onSubmit={submit}>
      <label className={styles.label} htmlFor="part-order-name">
        Pieza que falta
      </label>
      {part ? (
        <ul className={styles.lines}>
          <li>
            <span>
              {part.name} <span className={styles.muted}>· stock {part.stock ?? 0}</span>
            </span>
            <button type="button" className={styles.close} aria-label={`Quitar ${part.name}`} onClick={() => setPart(null)}>
              <X size={16} aria-hidden />
            </button>
          </li>
        </ul>
      ) : (
        <>
          <input
            id="part-order-name"
            className={styles.input}
            placeholder="Busca en el inventario o escribe la pieza"
            maxLength={150}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <div className={styles.chips}>
              {matches.map((p) => (
                <button key={p.id} type="button" className={styles.chip} onClick={() => choose(p)}>
                  {p.name} · stock {p.stock ?? 0}
                </button>
              ))}
            </div>
          )}
          {query.trim() && parts && matches.length === 0 && (
            <p className={styles.muted}>No está en el inventario: se pedirá como «{query.trim()}», sin sumar stock.</p>
          )}
        </>
      )}

      <div className={styles.fieldRow}>
        <span className={styles.field}>
          <label className={styles.label} htmlFor="part-order-provider">
            Proveedor
          </label>
          <input
            id="part-order-provider"
            className={styles.input}
            maxLength={100}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
        </span>
        <span className={styles.field}>
          <label className={styles.label} htmlFor="part-order-expected">
            Llegada prevista
          </label>
          <input
            id="part-order-expected"
            type="date"
            className={styles.input}
            min={today()}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </span>
        <span className={styles.field}>
          <label className={styles.label} htmlFor="part-order-qty">
            Cantidad
          </label>
          <input
            id="part-order-qty"
            type="number"
            min={1}
            max={999}
            className={styles.input}
            value={quantity}
            onChange={(e) => setQuantity(Math.min(999, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
          />
        </span>
      </div>

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={saving} disabledReason={missing}>
          {movesStatus ? "Crear pedido y pasar a Pendiente de piezas" : "Crear pedido"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
      </div>
    </form>
  );
}
