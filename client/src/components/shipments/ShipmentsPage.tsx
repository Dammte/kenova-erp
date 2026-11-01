"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { Reception } from "./Reception";
import {
  SHIPMENT_STATUSES,
  SHIPMENT_STATUS_LABEL,
  SHIPMENTS_PAGE_SIZE,
  canReceive,
  formatDay,
  lineState,
  listUrl,
  readQuery,
  shipmentSummary,
  type Shipment,
  type ShipmentPage,
  type ShipmentQuery,
} from "./shipments";
import styles from "./Shipments.module.css";

/** Design R2 3.14 «Envíos»: the shipments on the left, the open one on the right. */
export function ShipmentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = readQuery(params);
  const openId = params.get("envio");
  const [page, setPage] = useState<ShipmentPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const url = listUrl(query);

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as ShipmentPage;
        if (live) setPage(body);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url, attempt]);

  const go = (next: Partial<ShipmentQuery> & { envio?: string | null }) => {
    const q = { ...query, ...next };
    const p = new URLSearchParams();
    if (q.status) p.set("estado", q.status);
    if (q.page > 1) p.set("page", String(q.page));
    const envio = next.envio === undefined ? openId : next.envio;
    if (envio) p.set("envio", envio);
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const pages = page
    ? Math.max(1, Math.ceil(page.total / SHIPMENTS_PAGE_SIZE))
    : 1;

  return (
    <div className={styles.page}>
      <section className={styles.listPane} aria-label="Envíos">
        <h1 className={styles.title}>Envíos</h1>
        <div
          className={styles.filters}
          role="group"
          aria-label="Filtrar por estado"
        >
          {[null, ...SHIPMENT_STATUSES].map((s) => (
            <button
              key={s ?? "all"}
              type="button"
              className={styles.filter}
              aria-pressed={query.status === s}
              onClick={() => go({ status: s, page: 1 })}
            >
              {s ? SHIPMENT_STATUS_LABEL[s] : "Todos"}
            </button>
          ))}
        </div>

        {failed ? (
          <p className={styles.error} role="alert">
            No se han podido cargar los envíos.{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setAttempt((a) => a + 1)}
            >
              Reintentar
            </button>
          </p>
        ) : page === null ? (
          <ul className={styles.list} aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className={styles.skeleton} />
            ))}
          </ul>
        ) : page.items.length === 0 ? (
          <div className={styles.empty}>
            <p>
              {query.status
                ? `No hay envíos en «${SHIPMENT_STATUS_LABEL[query.status]}».`
                : "Aún no hay envíos. Cuando una tienda aliada mande equipos a Medina aparecerán aquí."}
            </p>
          </div>
        ) : (
          <ul className={styles.list}>
            {page.items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.item}
                  aria-current={s.id === openId ? "true" : undefined}
                  onClick={() => go({ envio: s.id })}
                >
                  <span className={styles.itemHead}>
                    <span className={styles.code}>{s.code}</span>
                    <ShipmentChip status={s.status} />
                  </span>
                  <span>
                    {s.fromStore.name} → {s.toStore.name}
                  </span>
                  <span className={styles.sub}>{shipmentSummary(s)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {page && pages > 1 && (
          <div className={styles.pager}>
            <Button
              variant="secondary"
              size="sm"
              disabledReason={
                query.page <= 1 ? "Ya estás en la primera página" : undefined
              }
              onClick={() => go({ page: query.page - 1 })}
            >
              Anterior
            </Button>
            <span className={styles.sub}>
              Página {query.page} de {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabledReason={
                query.page >= pages ? "Ya estás en la última página" : undefined
              }
              onClick={() => go({ page: query.page + 1 })}
            >
              Siguiente
            </Button>
          </div>
        )}
      </section>

      {openId && user && (
        <ShipmentDetail
          key={openId}
          id={openId}
          user={user}
          onChanged={() => setAttempt((a) => a + 1)}
          onClose={() => go({ envio: null })}
        />
      )}
    </div>
  );
}

function ShipmentChip({ status }: { status: Shipment["status"] }) {
  return (
    <span className={`${styles.chip} ${styles[`chip_${status}`]}`}>
      {SHIPMENT_STATUS_LABEL[status]}
    </span>
  );
}

interface DetailProps {
  id: string;
  user: { role: string; storeId: string | null };
  onChanged: () => void;
  onClose: () => void;
}

function ShipmentDetail({ id, user, onChanged, onClose }: DetailProps) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setProblem(null);
    apiFetch(`${API_URL}/shipments/${id}`)
      .then(async (res) => {
        if (res.status === 404)
          throw new Error("Este envío no existe o no es de tu tienda.");
        if (!res.ok) throw new Error("No se ha podido cargar el envío.");
        const body = (await res.json()) as Shipment;
        if (live) setShipment(body);
      })
      .catch((e: Error) => live && setProblem(e.message));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  if (problem) {
    return (
      <section className={styles.card}>
        <p className={styles.error} role="alert">
          {problem}{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setAttempt((a) => a + 1)}
          >
            Reintentar
          </button>
        </p>
      </section>
    );
  }
  if (!shipment) {
    return (
      <section className={styles.card} aria-busy="true">
        <p className={styles.sub}>Cargando envío…</p>
      </section>
    );
  }

  const lines = shipment.lines ?? [];
  const mayReceive = canReceive(shipment, user);

  return (
    <section className={styles.card} aria-label={`Envío ${shipment.code}`}>
      <header className={styles.cardHead}>
        <div className={styles.cardTitle}>
          <h2 className={styles.code}>{shipment.code}</h2>
          <ShipmentChip status={shipment.status} />
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Cerrar envío"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className={styles.sub}>
          {shipment.fromStore.name} → {shipment.toStore.name} ·{" "}
          {shipmentSummary(shipment)}
        </p>
      </header>

      {receiving ? (
        <Reception
          shipment={shipment}
          onCancel={() => {
            setReceiving(false);
            setAttempt((a) => a + 1);
          }}
          onClosed={() => {
            setReceiving(false);
            setAttempt((a) => a + 1);
            onChanged();
          }}
        />
      ) : (
        <>
          {shipment.status === "sent" &&
            (mayReceive ? (
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setReceiving(true)}
                >
                  Recibir equipos
                </Button>
              </div>
            ) : (
              <p className={styles.sub}>
                Este envío lo recibe {shipment.toStore.name}.
              </p>
            ))}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Orden</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Equipo</th>
                  <th scope="col">Accesorios</th>
                  <th scope="col">Recepción</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const state = lineState(l);
                  return (
                    <tr key={l.orderId}>
                      <td>
                        <Link
                          href={`/ordenes?orden=${l.orderId}`}
                          className={styles.code}
                        >
                          {l.orderCode}
                        </Link>
                      </td>
                      <td>{l.clientName || "—"}</td>
                      <td>{l.device ?? "—"}</td>
                      <td>{l.accessories || "—"}</td>
                      <td>
                        <span className={styles[`state_${state.tone}`]}>
                          {state.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className={styles.sub}>
            {shipment.carrier ? `Transporta: ${shipment.carrier} · ` : ""}
            Creado por {shipment.createdBy?.fullName ?? "—"} el{" "}
            {formatDay(shipment.createdAt)}
          </p>
        </>
      )}
    </section>
  );
}
