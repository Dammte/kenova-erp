"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL, apiFetch } from "@/lib/api";
import { STATUS_LABEL, type OrderStatus } from "@/components/ui";
import { cleanImei } from "./intake";
import styles from "./Intake.module.css";

/** GET /api/service-orders/by-imei */
export interface ImeiLookup {
  openOrders: { id: string; code: string; status: OrderStatus; createdAt: string }[];
  /** Newest first. */
  deliveries: Delivery[];
}

export interface Delivery {
  id: string;
  code: string;
  daysAgo: number;
  withinWarranty: boolean;
  /** In the trash: it has to be restored to open a warranty claim. */
  inTrash?: boolean;
  summary: string;
}

/** Shorter IMEIs and serials match too much to be worth a warning. */
const MIN_LENGTH = 8;
const DELAY_MS = 400;

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

const ago = (d: Delivery) => `hace ${d.daysAgo} ${d.daysAgo === 1 ? "día" : "días"}`;

/**
 * Design 1.3 «IMEI ya en taller» and R2 «garantía detectada en el alta»:
 * warns about open orders for the same IMEI and offers to open the intake as
 * a warranty claim of its latest delivery. Out of the warranty period only
 * the partners can still do it. It never blocks the intake.
 */
export function ImeiWarning({
  imei,
  partner,
  onWarranty,
}: {
  imei: string;
  partner: boolean;
  onWarranty: (d: Delivery) => void;
}) {
  const [found, setFound] = useState<ImeiLookup | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [all, setAll] = useState(false);
  const clean = cleanImei(imei ?? "");

  useEffect(() => {
    setFound(null);
    setDismissed(false);
    setAll(false);
    if (clean.length < MIN_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch(`${API_URL}/service-orders/by-imei?imei=${encodeURIComponent(clean)}`, { signal: controller.signal })
        .then(async (res) => (res.ok ? ((await res.json()) as ImeiLookup) : null))
        // A failed check must not stop the intake.
        .catch(() => null)
        .then((r) => !controller.signal.aborted && setFound(r));
    }, DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [clean]);

  const open = found?.openOrders ?? [];
  const deliveries = found?.deliveries ?? [];
  // The latest delivery is the one proposed; the rest on request.
  const shown = all ? deliveries : deliveries.slice(0, 1);
  const worth = deliveries.length > 0;
  if (dismissed || (open.length === 0 && !worth)) return null;

  const offer = (d: Delivery) => {
    const link = (
      <Link href={`/ordenes?orden=${d.id}`} target="_blank">
        {d.code}
      </Link>
    );
    if (d.inTrash) {
      return (
        <li key={d.id}>
          La orden {link} está en la Papelera. Restáurala o crea una orden normal.
        </li>
      );
    }
    return (
      <li key={d.id}>
        {d.withinWarranty ? (
          <>
            Este equipo se entregó {ago(d)} en {link} ({d.summary}). Está dentro del plazo de garantía.
          </>
        ) : (
          <>
            Este equipo se entregó {ago(d)} ({link}, {d.summary}). Está fuera del plazo de garantía.
          </>
        )}{" "}
        {(d.withinWarranty || partner) && (
          <button type="button" className={styles.link} onClick={() => onWarranty(d)}>
            {d.withinWarranty ? `Abrir como garantía de ${d.code}` : "Abrir garantía igualmente"}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className={styles.warning} role="status">
      <p className={styles.label}>Aviso · este IMEI ya ha pasado por el taller</p>
      <ul>
        {open.map((o) => (
          <li key={o.id}>
            Tiene abierta la orden{" "}
            <Link href={`/ordenes?orden=${o.id}`} target="_blank">
              {o.code}
            </Link>{" "}
            ({STATUS_LABEL[o.status] ?? o.status}, {shortDate.format(new Date(o.createdAt))}). ¿Es el mismo equipo?
          </li>
        ))}
        {worth && shown.map(offer)}
      </ul>
      <p className={styles.warningActions}>
        {worth && !all && deliveries.length > 1 && (
          <button type="button" className={styles.link} onClick={() => setAll(true)}>
            Ver las {deliveries.length} entregas
          </button>
        )}
        <button type="button" className={styles.link} onClick={() => setDismissed(true)}>
          {worth ? "Es otra avería, seguir con el alta" : "Es otro caso, seguir con el alta"}
        </button>
      </p>
    </div>
  );
}
