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
  deliveries: { id: string; code: string; daysAgo: number; withinWarranty: boolean; summary: string }[];
}

/** Shorter IMEIs and serials match too much to be worth a warning. */
const MIN_LENGTH = 8;
const DELAY_MS = 400;

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Design 1.3: "IMEI ya en taller". Warns about open orders and deliveries
 * still under warranty for the same IMEI; it never blocks the intake.
 */
export function ImeiWarning({ imei }: { imei: string }) {
  const [found, setFound] = useState<ImeiLookup | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const clean = cleanImei(imei ?? "");

  useEffect(() => {
    setFound(null);
    setDismissed(false);
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
  const warranty = (found?.deliveries ?? []).filter((d) => d.withinWarranty);
  if (dismissed || (open.length === 0 && warranty.length === 0)) return null;

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
        {warranty.map((d) => (
          <li key={d.id}>
            <Link href={`/ordenes?orden=${d.id}`} target="_blank">
              {d.code}
            </Link>{" "}
            se entregó hace {d.daysAgo} {d.daysAgo === 1 ? "día" : "días"} y sigue en garantía: {d.summary}.
          </li>
        ))}
      </ul>
      <p>
        <button type="button" className={styles.link} onClick={() => setDismissed(true)}>
          Es otro caso, seguir con el alta
        </button>
      </p>
    </div>
  );
}
