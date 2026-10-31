"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { API_URL, apiFetch } from "@/lib/api";
import styles from "./OrderPanel.module.css";

/** GET /api/inventory, the fields the picker reads. */
export interface StockPart {
  id: string;
  sku: string;
  name: string;
  stock: number | null;
}

export interface UsedPart {
  part: StockPart;
  quantity: number;
}

/** Matches shown under the search. */
const SHOWN = 8;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Parts asking for more than there is in stock. */
export const shortParts = (used: UsedPart[]) => used.filter((u) => u.quantity > (u.part.stock ?? 0));

/**
 * Design R2 "Piezas usadas": the parts that come out of stock when the order
 * is finished. Searched by name or SKU; each shows the stock it leaves.
 */
export function PartsPicker({ used, onChange }: { used: UsedPart[]; onChange: (used: UsedPart[]) => void }) {
  const [parts, setParts] = useState<StockPart[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/inventory`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setParts((await res.json()) as StockPart[]);
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, []);

  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (!q || !parts) return [];
    const chosen = new Set(used.map((u) => u.part.id));
    return parts
      .filter((p) => !chosen.has(p.id) && (fold(p.name).includes(q) || fold(p.sku).includes(q)))
      .slice(0, SHOWN);
  }, [query, parts, used]);

  const add = (part: StockPart) => {
    onChange([...used, { part, quantity: 1 }]);
    setQuery("");
  };
  const setQuantity = (id: string, quantity: number) =>
    onChange(used.map((u) => (u.part.id === id ? { ...u, quantity } : u)));

  return (
    <fieldset className={styles.group}>
      <legend className={styles.label}>
        Piezas usadas <span className={styles.muted}>· se descuentan del stock al finalizar</span>
      </legend>

      {used.length > 0 && (
        <ul className={styles.lines}>
          {used.map(({ part, quantity }) => {
            const stock = part.stock ?? 0;
            const short = quantity > stock;
            return (
              <li key={part.id}>
                <span>
                  {part.name}
                  <span className={short ? styles.error : styles.muted}>
                    {short
                      ? ` · Sin stock: quedan ${stock}. Haz un ajuste de stock o quita la pieza.`
                      : ` · stock ${stock} → ${stock - quantity}`}
                  </span>
                </span>
                <span className={styles.partControls}>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    aria-label={`Cantidad de ${part.name}`}
                    className={styles.qty}
                    value={quantity}
                    onChange={(e) => setQuantity(part.id, Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                  <button
                    type="button"
                    className={styles.close}
                    aria-label={`Quitar ${part.name}`}
                    onClick={() => onChange(used.filter((u) => u.part.id !== part.id))}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {failed ? (
        <p className={styles.error}>No se ha podido cargar el inventario. Puedes finalizar sin piezas.</p>
      ) : (
        <>
          <input
            className={styles.input}
            aria-label="Buscar pieza del inventario"
            placeholder={parts ? "Añadir pieza del inventario por nombre o SKU…" : "Cargando inventario…"}
            disabled={!parts}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <div className={styles.chips}>
              {matches.map((p) => (
                <button key={p.id} type="button" className={styles.chip} onClick={() => add(p)}>
                  {p.name} · {p.sku} · stock {p.stock ?? 0}
                </button>
              ))}
            </div>
          )}
          {query.trim() && parts && matches.length === 0 && (
            <p className={styles.muted}>Ninguna pieza coincide con «{query.trim()}».</p>
          )}
        </>
      )}
    </fieldset>
  );
}
