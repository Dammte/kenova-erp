"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { arrival, formatDate, type PartOrderRow } from "./inventory";
import styles from "./Inventory.module.css";

/**
 * Design 3.4 «Pedidos»: the parts asked from suppliers for orders waiting on
 * them. Receiving one raises the stock; the order goes back to «En progreso»
 * from its own panel.
 */
export function PartOrders() {
  const [rows, setRows] = useState<PartOrderRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<PartOrderRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(`${API_URL}/part-orders`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) setRows((await res.json()) as PartOrderRow[]);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  const receive = async (p: PartOrderRow) => {
    setBusy(p.id);
    setProblem(null);
    setNotice(null);
    try {
      const res = await apiFetch(`${API_URL}/part-orders/${p.id}/receive`, { method: "POST" });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido marcar como recibido."));
      } else {
        setNotice((await res.json()) as PartOrderRow);
      }
      setAttempt((n) => n + 1);
    } catch {
      setProblem("No se ha podido marcar como recibido: se ha perdido la conexión.");
    } finally {
      setBusy(null);
    }
  };

  const pending = rows?.filter((r) => !r.receivedAt).length ?? 0;

  return (
    <>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice.partName} recibido{notice.inventoryId ? " y sumado al stock" : ""}.{" "}
          {notice.orderStatus === "pendiente_piezas" && (
            <>
              <Link href={`/ordenes?orden=${notice.orderId}`} className={styles.link}>
                {notice.orderCode}
              </Link>{" "}
              sigue en «Pendiente de piezas»: pásala a En progreso desde la orden.
            </>
          )}
        </p>
      )}
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      {failed && (
        <div role="alert" className={styles.error}>
          No se han podido cargar los pedidos.{" "}
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}
      {!rows && !failed && <p className={styles.muted}>Cargando…</p>}
      {rows && rows.length === 0 && (
        <div className={styles.empty}>
          <p>No hay pedidos de piezas.</p>
          <p className={styles.muted}>Se crean al pasar una orden a «Pendiente de piezas».</p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <>
          <table className={`${styles.table} ${styles.orders}`}>
            <thead>
              <tr>
                <th>Pieza</th>
                <th>Orden</th>
                <th className={styles.wide}>Proveedor</th>
                <th className={styles.wide}>Pedido</th>
                <th>Llegada</th>
                <th aria-label="Acción" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={p.receivedAt ? styles.doneRow : undefined}>
                  <td>
                    <strong>
                      {p.partName}
                      {p.quantity > 1 ? ` × ${p.quantity}` : ""}
                    </strong>
                    {p.assignedTo && <span className={`${styles.muted} ${styles.sub}`}>Para {p.assignedTo}</span>}
                  </td>
                  <td>
                    <Link href={`/ordenes?orden=${p.orderId}`} className={`${styles.link} ${styles.sku}`}>
                      {p.orderCode}
                    </Link>
                  </td>
                  <td className={styles.wide}>{p.provider ?? "—"}</td>
                  <td className={styles.wide}>{formatDate(p.orderedAt)}</td>
                  <td className={p.late ? styles.late : undefined}>{p.receivedAt ? "—" : arrival(p)}</td>
                  <td className={styles.num}>
                    {p.receivedAt ? (
                      <span className={styles.muted}>
                        Recibido {formatDate(p.receivedAt.slice(0, 10))}
                        {p.receivedBy ? ` · ${p.receivedBy}` : ""}
                      </span>
                    ) : (
                      <Button size="sm" loading={busy === p.id} onClick={() => receive(p)}>
                        Marcar recibido
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.muted}>
            {pending} {pending === 1 ? "pendiente" : "pendientes"}
          </p>
        </>
      )}
    </>
  );
}
