"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { STATUS_LABEL, StatusChip, type OrderStatus } from "@/components/ui";
import styles from "./StatusMenu.module.css";

/**
 * Statuses the list changes on the spot. Finishing, cancelling and delivering
 * ask for more (notes, reason, payment), so they open the order instead.
 */
export const QUICK_STATUSES: OrderStatus[] = [
  "pendiente_cliente",
  "en_progreso",
  "pendiente_piezas",
];

interface Props {
  code: string;
  status: OrderStatus;
  /** The order's page, where finishing and cancelling happen for now. */
  href: string;
  onChange: (status: OrderStatus) => void;
}

/** Design 1.4: the status chip of a row is a menu to move the order on. */
export function StatusMenu({ code, status, href, onChange }: Props) {
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

  // Finished, delivered and cancelled orders change from their own page.
  if (!QUICK_STATUSES.includes(status)) return <StatusChip status={status} />;

  const pick = (next: OrderStatus) => {
    setOpen(false);
    if (next !== status) onChange(next);
  };

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
          {QUICK_STATUSES.map((s) => (
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
          <Link href={href} className={styles.item}>
            {STATUS_LABEL.finalizado}…<span className={styles.hint}>abre la orden</span>
          </Link>
          <Link href={href} className={styles.item}>
            {STATUS_LABEL.cancelado}…<span className={styles.hint}>abre la orden</span>
          </Link>
        </div>
      )}
    </div>
  );
}
