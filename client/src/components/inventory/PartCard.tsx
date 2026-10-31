"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatDateTime } from "@/components/orders/orderDetail";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { StockBadge } from "./StockBadge";
import { MOVE_LABEL, margin, signed, skuTag, type StockLine, type StockStatus } from "./inventory";
import styles from "./Inventory.module.css";

/** GET /api/inventory/:id, the fields the card shows. */
interface Part {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  ubication: string | null;
  provider: string | null;
  stock: number | null;
  minimalStock: number | null;
  salesPrice: string | number | null;
  costPrice: string | null;
}

/** What a movement without an order or a note was. */
const MOVE_DETAIL: Record<StockLine["kind"], string> = {
  initial: "Stock al darlo de alta",
  purchase: "Compra",
  order: "Orden",
  adjust: "Corrección a mano",
};

const statusOf = (stock: number, min: number): StockStatus => (stock === 0 ? "out" : stock < min ? "low" : "ok");

/** A part's card: its data, prices and why its stock is what it is. */
export function PartCard({ id, onClose }: { id: string; onClose: () => void }) {
  const [part, setPart] = useState<Part | null>(null);
  const [moves, setMoves] = useState<StockLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const get = async <T,>(path: string): Promise<T> => {
      const res = await apiFetch(`${API_URL}/inventory/${id}${path}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    };
    Promise.all([get<Part>(""), get<StockLine[]>("/movements")])
      .then(([p, m]) => {
        if (!live) return;
        setPart(p);
        setMoves(m);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  if (failed) {
    return (
      <aside className={styles.card} aria-label="Ficha del repuesto">
        <p role="alert" className={styles.error}>
          No se ha podido abrir el repuesto.{" "}
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </p>
      </aside>
    );
  }
  if (!part || !moves) {
    return (
      <aside className={styles.card} aria-label="Ficha del repuesto">
        <p className={styles.muted}>Cargando…</p>
      </aside>
    );
  }

  const stock = part.stock ?? 0;
  const min = part.minimalStock ?? 0;
  const sale = part.salesPrice === null ? null : String(part.salesPrice);
  return (
    <aside className={styles.card} aria-label={`Repuesto ${part.name}`}>
      <header className={styles.cardHead}>
        <span className={styles.bigTag} aria-hidden>
          {skuTag(part.sku)}
        </span>
        <div className={styles.cardTitle}>
          <h2>{part.name}</h2>
          <p className={styles.muted}>
            {[part.sku, part.category, part.ubication].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" className={styles.close} aria-label="Cerrar ficha" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className={styles.cardActions}>
        <Link href={`/inventory/${part.id}/edit`} className={styles.secondaryLink}>
          Editar
        </Link>
      </div>

      <dl className={styles.stats}>
        <div>
          <dt>Stock</dt>
          <dd>
            <StockBadge part={{ stock, minimalStock: min, status: statusOf(stock, min) }} />
          </dd>
        </div>
        <div>
          <dt>Venta</dt>
          <dd>{Number(sale) ? formatEur(sale) : "—"}</dd>
        </div>
        <div>
          <dt>Coste</dt>
          <dd>{part.costPrice !== null ? formatEur(part.costPrice) : "—"}</dd>
        </div>
        <div>
          <dt>Margen</dt>
          <dd>{margin(sale, part.costPrice)}</dd>
        </div>
      </dl>

      <dl className={styles.facts}>
        <dt>Compatible</dt>
        <dd>{part.model ?? "—"}</dd>
        <dt>Marca</dt>
        <dd>{part.brand ?? "—"}</dd>
        <dt>Proveedor</dt>
        <dd>{part.provider ?? "—"}</dd>
        <dt>Mínimo</dt>
        <dd>{min}</dd>
        {part.description && (
          <>
            <dt>Notas</dt>
            <dd>{part.description}</dd>
          </>
        )}
      </dl>

      <section aria-labelledby="moves">
        <h3 id="moves" className={styles.sectionTitle}>
          Movimientos
        </h3>
        {moves.length === 0 ? (
          <p className={styles.muted}>Sin movimientos registrados todavía.</p>
        ) : (
          <table className={styles.moves}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Detalle</th>
                <th className={styles.num}>Uds.</th>
                <th className={styles.num}>Queda</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTime(m.createdAt)}</td>
                  <td>
                    <span className={`${styles.moveKind} ${styles[`k_${m.kind}`]}`}>{MOVE_LABEL[m.kind]}</span>
                  </td>
                  <td>
                    {m.orderId && m.orderCode ? (
                      <Link href={`/ordenes?orden=${m.orderId}`} className={styles.link}>
                        {m.orderCode}
                      </Link>
                    ) : (
                      (m.note ?? MOVE_DETAIL[m.kind])
                    )}
                    {m.userName && <span className={styles.muted}> · {m.userName}</span>}
                  </td>
                  <td className={`${styles.num} ${m.quantity > 0 ? styles.plus : ""}`}>{signed(m.quantity)}</td>
                  <td className={styles.num}>{m.stockAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </aside>
  );
}
