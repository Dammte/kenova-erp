"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { STATUS_LABEL, StatusChip, type OrderStatus } from "@/components/ui";
import styles from "./StatusMenu.module.css";

/**
 * Statuses the list changes on the spot. Finishing asks for the work done
 * (its own dialog); cancelling and delivering ask for more (reason, payment),
 * so they open the order's panel.
 */
export const QUICK_STATUSES: OrderStatus[] = [
  "pendiente_cliente",
  "en_progreso",
  "pendiente_piezas",
];

interface Props {
  code: string;
  status: OrderStatus;
  onChange: (status: OrderStatus) => void;
  /** Opens the «Finalizar» dialog over the list. */
  onFinish: () => void;
  /** Opens the order's panel, where cancelling and delivering happen. */
  onOpen: () => void;
}

/** Design 1.4: the status chip of a row is a menu to move the order on. */
export function StatusMenu({ code, status, onChange, onFinish, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Delivered and cancelled orders are closed: they change from their panel.
  const finished = status === "finalizado";
  if (!finished && !QUICK_STATUSES.includes(status)) return <StatusChip status={status} />;

  const pick = (next: OrderStatus) => {
    setOpen(false);
    if (next !== status) onChange(next);
  };
  const then = (go: () => void) => () => {
    setOpen(false);
    go();
  };
  // A finished order can only go back to work or be delivered.
  const quick: OrderStatus[] = finished ? ["en_progreso"] : QUICK_STATUSES;

  return (
    // Clicks here must not open the row.
    <div className={styles.wrap} ref={wrap} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${STATUS_LABEL[status]}: cambiar estado de ${code}`}
        onClick={() => setOpen((o) => !o)}
      >
        <StatusChip status={status} />
        <ChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <div id={menuId} className={styles.menu}>
          <p className={styles.head}>Cambiar estado de {code}</p>
          {finished && (
            <p className={`${styles.item} ${styles.static}`} aria-current="true">
              {STATUS_LABEL.finalizado}
              <span className={styles.hint}>actual</span>
            </p>
          )}
          {quick.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.item}
              aria-current={s === status ? "true" : undefined}
              onClick={() => pick(s)}
            >
              {STATUS_LABEL[s]}
              {s === status && <span className={styles.hint}>actual</span>}
            </button>
          ))}
          {finished ? (
            <button type="button" className={styles.item} onClick={then(onOpen)}>
              Entregar…<span className={styles.hint}>abre la orden</span>
            </button>
          ) : (
            <>
              <button type="button" className={styles.item} onClick={then(onFinish)}>
                Finalizar…<span className={styles.hint}>trabajo y repuestos</span>
              </button>
              <button type="button" className={styles.item} onClick={then(onOpen)}>
                Cancelar…<span className={styles.hint}>abre la orden</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
