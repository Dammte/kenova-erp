"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  commissionLabel,
  type CommissionType,
} from "@/components/stores/stores";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { Settlement, type CommissionSettlement } from "./Settlement";
import { formatDay } from "./shipments";
import styles from "./Shipments.module.css";

/** GET /api/stores/:id/commissions. */
export interface CommissionMonth {
  month: string;
  store: { id: string; name: string };
  lines: {
    orderId: string;
    orderCode: string;
    deliveredAt: string;
    clientName: string;
    device: string | null;
    amountPaid: string;
    commissionType: CommissionType;
    commissionValue: string;
    commissionAmount: string;
    warranty: boolean;
  }[];
  collected: string;
  commission: string;
  toKenova: string;
  /** Left pending by the previous settlement (negative: the store paid more). */
  carriedIn: string;
  /** toKenova + carriedIn: what the store has to hand over. */
  due: string;
  settlement: CommissionSettlement | null;
}

interface StoreOption {
  id: string;
  name: string;
  isMain: boolean;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** This month in Madrid, as AAAA-MM. */
export function currentMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

/** «octubre de 2026». */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

/** The month before or after, as AAAA-MM. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Design R2 3.14 «Comisiones»: a partner store's month, as it is frozen on
 * each delivered order. The partners pick the store; a store sees its own,
 * read only.
 */
export function Commissions() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const partner = user?.role === "SUPER_ADMIN";
  const askedMonth = params.get("mes");
  const month =
    askedMonth && MONTH.test(askedMonth) ? askedMonth : currentMonth();
  const [stores, setStores] = useState<StoreOption[] | null>(null);
  const [data, setData] = useState<CommissionMonth | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!partner) return;
    let live = true;
    apiFetch(`${API_URL}/stores`)
      .then(async (res) => {
        const all = res.ok ? ((await res.json()) as StoreOption[]) : [];
        if (live) setStores(all.filter((s) => !s.isMain));
      })
      .catch(() => live && setStores([]));
    return () => {
      live = false;
    };
  }, [partner]);

  const storeId = partner
    ? (params.get("tienda") ?? stores?.[0]?.id ?? null)
    : (user?.storeId ?? null);

  useEffect(() => {
    if (!storeId) return;
    let live = true;
    setData(null);
    setProblem(null);
    apiFetch(`${API_URL}/stores/${storeId}/commissions?month=${month}`)
      .then(async (res) => {
        if (!res.ok) {
          const message = await errorMessage(
            res,
            "No se ha podido cargar la comisión.",
          );
          if (live) setProblem(message);
          return;
        }
        const body = (await res.json()) as CommissionMonth;
        if (live) setData(body);
      })
      .catch(() => live && setProblem("No se ha podido cargar la comisión."));
    return () => {
      live = false;
    };
  }, [storeId, month, reload]);

  const go = (next: { tienda?: string; mes?: string }) => {
    const p = new URLSearchParams({ vista: "comisiones" });
    const tienda = next.tienda ?? (partner ? storeId : null);
    if (tienda) p.set("tienda", tienda);
    p.set("mes", next.mes ?? month);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const noStores = partner && stores !== null && stores.length === 0;

  return (
    <section className={styles.commissions} aria-label="Comisiones">
      <div className={styles.commissionBar}>
        <h1 className={styles.title}>Comisiones</h1>
        {partner && stores && stores.length > 0 && (
          <label className={styles.field}>
            <span>Tienda</span>
            <select
              className={styles.select}
              value={storeId ?? ""}
              onChange={(e) => go({ tienda: e.target.value })}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className={styles.monthPicker} role="group" aria-label="Mes">
          <button
            type="button"
            className={styles.filter}
            aria-label="Mes anterior"
            onClick={() => go({ mes: shiftMonth(month, -1) })}
          >
            ‹
          </button>
          <span className={styles.monthName}>{monthLabel(month)}</span>
          <button
            type="button"
            className={styles.filter}
            aria-label="Mes siguiente"
            onClick={() => go({ mes: shiftMonth(month, 1) })}
          >
            ›
          </button>
        </div>
      </div>

      {noStores ? (
        <div className={styles.empty}>
          <p>
            Aún no hay tiendas aliadas, así que no hay comisiones que liquidar.
          </p>
        </div>
      ) : problem ? (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      ) : !data ? (
        <p className={styles.sub}>Cargando comisión…</p>
      ) : (
        <>
          <dl className={styles.totals}>
            <div>
              <dt>Cobrado</dt>
              <dd>{formatEur(data.collected)}</dd>
            </div>
            <div>
              <dt>Comisión de {data.store.name}</dt>
              <dd>{formatEur(data.commission)}</dd>
            </div>
            {Number(data.carriedIn) === 0 ? (
              <div className={styles.totalMain}>
                <dt>A entregar a Kenova</dt>
                <dd>{formatEur(data.toKenova)}</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>Del mes para Kenova</dt>
                  <dd>{formatEur(data.toKenova)}</dd>
                </div>
                <div>
                  <dt>Saldo de meses anteriores</dt>
                  <dd>{formatEur(data.carriedIn)}</dd>
                </div>
                <div className={styles.totalMain}>
                  <dt>A entregar a Kenova</dt>
                  <dd>{formatEur(data.due)}</dd>
                </div>
              </>
            )}
          </dl>

          {storeId && (
            <Settlement
              key={`${storeId}-${month}`}
              storeId={storeId}
              storeName={data.store.name}
              month={month}
              due={data.due}
              settlement={data.settlement}
              partner={partner}
              onChange={() => setReload((n) => n + 1)}
            />
          )}

          {data.lines.length === 0 ? (
            <div className={styles.empty}>
              <p>
                Este mes aún no hay órdenes entregadas, así que no hay comisión.
              </p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Orden</th>
                    <th scope="col">Entregada</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Equipo</th>
                    <th scope="col" className={styles.num}>
                      Cobrado
                    </th>
                    <th scope="col">Comisión</th>
                    <th scope="col" className={styles.num}>
                      Importe
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.orderId}>
                      <td>
                        <Link
                          href={`/ordenes?orden=${l.orderId}`}
                          className={styles.code}
                        >
                          {l.orderCode}
                        </Link>
                      </td>
                      <td>{formatDay(l.deliveredAt)}</td>
                      <td>{l.clientName || "—"}</td>
                      <td>{l.device ?? "—"}</td>
                      <td className={styles.num}>{formatEur(l.amountPaid)}</td>
                      <td>
                        {l.warranty
                          ? "garantía"
                          : commissionLabel(
                              l.commissionType,
                              l.commissionValue,
                            )}
                      </td>
                      <td className={styles.num}>
                        {formatEur(l.commissionAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={styles.sub}>
            La comisión se congela al entregar cada orden: cambiarla en
            Configuración › Tienda no altera las ya entregadas.
          </p>
        </>
      )}
    </section>
  );
}
