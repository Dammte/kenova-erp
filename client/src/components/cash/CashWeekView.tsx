"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  METHOD_LABEL,
  dayChip,
  shiftDate,
  weekDayState,
  weekLabel,
  type CashMethod,
  type CashWeek,
} from "./cash";
import styles from "./Cash.module.css";

const METHODS: CashMethod[] = ["cash", "card", "transfer", "other"];

/**
 * Design 3.2 «Semana»: Monday to Sunday, one row per cash day. Choosing a
 * day opens its detail.
 */
export function CashWeekView({
  storeId,
  today,
  onOpenDay,
}: {
  storeId: string;
  /** The cash day running now, the last one a week can show. */
  today: string;
  onOpenDay: (date: string) => void;
}) {
  const [anchor, setAnchor] = useState(today);
  const [data, setData] = useState<CashWeek | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const qs = new URLSearchParams({ date: anchor });
    if (storeId) qs.set("storeId", storeId);
    apiFetch(`${API_URL}/cash/week?${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const week = (await res.json()) as CashWeek;
        if (live) setData(week);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [storeId, anchor, attempt]);

  const isCurrent = !!data && data.to >= today;
  return (
    <section className={styles.card} aria-label="Semana">
      <div className={styles.weekNav}>
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft size={16} aria-hidden />}
          onClick={() => setAnchor((a) => shiftDate(data?.from ?? a, 7))}
        >
          Semana anterior
        </Button>
        <h2 className={styles.cardTitle}>
          {data ? weekLabel(data.from, data.to) : "Semana"}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronRight size={16} aria-hidden />}
          disabledReason={isCurrent ? "Es la semana en curso" : undefined}
          onClick={() =>
            data &&
            setAnchor(
              shiftDate(data.from, -7) > today
                ? today
                : shiftDate(data.from, -7),
            )
          }
        >
          Semana siguiente
        </Button>
      </div>
      {failed && (
        <div role="alert" className={styles.error}>
          No se ha podido cargar la semana. Comprueba la conexión.{" "}
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}
      {!data && !failed && <p className={styles.muted}>Cargando…</p>}
      {data && (
        <div className={styles.tableWrap}>
          <table className={styles.weekTable}>
            <thead>
              <tr>
                <th>Día</th>
                {METHODS.map((m) => (
                  <th key={m} className={styles.num}>
                    {METHOD_LABEL[m]}
                  </th>
                ))}
                <th className={styles.num}>Total cobrado</th>
                <th className={styles.num}>Entradas y salidas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date}>
                  <td>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => onOpenDay(d.date)}
                    >
                      {dayChip(d.date, today)}
                    </button>
                  </td>
                  {METHODS.map((m) => (
                    <td
                      key={m}
                      className={`${styles.num} ${Number(d.byMethod[m]) < 0 ? styles.negative : ""}`}
                    >
                      {formatEur(d.byMethod[m])}
                    </td>
                  ))}
                  <td className={`${styles.num} ${styles.strongCell}`}>
                    {formatEur(d.total)}
                  </td>
                  <td
                    className={`${styles.num} ${Number(d.manual) < 0 ? styles.negative : ""}`}
                  >
                    {formatEur(d.manual)}
                  </td>
                  <td className={styles.muted}>{weekDayState(d)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Semana</th>
                {METHODS.map((m) => (
                  <td key={m} className={styles.num}>
                    {formatEur(data.byMethod[m])}
                  </td>
                ))}
                <td className={`${styles.num} ${styles.strongCell}`}>
                  {formatEur(data.total)}
                </td>
                <td className={styles.num}>{formatEur(data.manual)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
