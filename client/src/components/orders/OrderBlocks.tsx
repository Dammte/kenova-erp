"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Banknote, Eye, EyeOff, FileText, MessageCircle, Phone, Printer, Send, Tag, Undo2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  CONTACT_LABEL,
  DEVICE_TYPE_LABEL,
  METHOD_LABEL,
  canQuote,
  formatDateTime,
  shopDays,
  whatsappHref,
  type OrderDetail,
  type OrderNote,
  type OrderPayment,
} from "./orderDetail";
import { FAULT_LABEL } from "./orderList";
import type { OrderNotice } from "@/components/notices/notices";
import { NoticeForm } from "./NoticeForm";
import { ChargeForm } from "./ChargeForm";
import { RefundForm, refundable } from "./RefundForm";
import { OrderNotes } from "./OrderNotes";
import styles from "./OrderPanel.module.css";

/**
 * The blocks of an order, shared by the side panel and the full page
 * (design R3: «panel y ficha comparten cabecera y acciones»).
 */

/** How long a revealed unlock code stays on screen. */
export const REVEAL_MS = 30_000;

export interface LoadedOrder {
  order: OrderDetail;
  payments: OrderPayment[];
  notes: OrderNote[];
  notices: OrderNotice[];
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await apiFetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
  return (await res.json()) as T;
}

/** The order with its payments, notes and notices; `retry` reloads it. */
export function useOrder(id: string) {
  const [data, setData] = useState<LoadedOrder | null>(null);
  const [error, setError] = useState<"missing" | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const base = `${API_URL}/service-orders/${id}`;
    setError(null);
    Promise.all([
      getJson<OrderDetail>(base, controller.signal),
      getJson<OrderPayment[]>(`${base}/payments`, controller.signal),
      getJson<OrderNote[]>(`${base}/sticky-notes`, controller.signal),
      // The notices only add to the history: the order still opens without them.
      getJson<OrderNotice[]>(`${base}/notices`, controller.signal).catch(() => []),
    ])
      .then(([order, payments, notes, notices]) =>
        setData({ order, payments, notes, notices: Array.isArray(notices) ? notices : [] }),
      )
      .catch((e: { status?: number }) => {
        if (controller.signal.aborted) return;
        // Another store's order answers 404 too: the server never confirms it exists.
        setError(e.status === 404 ? "missing" : "failed");
      });
    return () => controller.abort();
  }, [id, attempt]);

  return { data, error, retry: () => setAttempt((n) => n + 1) };
}

/** «3 días en taller · entrada 29/11/2026 09:57». */
export function headline(order: OrderDetail): string {
  const days = shopDays(order);
  const entry = `entrada ${formatDateTime(order.createdAt)}`;
  if (days === null) return entry;
  const what = order.status === "finalizado" ? "sin recoger" : "en taller";
  return `${days} ${days === 1 ? "día" : "días"} ${what} · ${entry}`;
}

/** Whether the client was sent a notice after the order was finished. */
export function notifiedSinceFinished(order: OrderDetail, notices: OrderNotice[]): boolean {
  if (!order.finishedAt) return notices.length > 0;
  const finished = Date.parse(order.finishedAt);
  return notices.some((n) => Date.parse(n.sentAt) >= finished);
}

export function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.message} role="alert">
      <p className={styles.messageTitle}>{title}</p>
      <p>{children}</p>
    </div>
  );
}

export function Card({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  /** A button beside the title, such as «Editar». */
  action?: ReactNode;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      {action ? (
        <div className={styles.blockHead}>
          <h3 className={styles.cardTitle}>{title}</h3>
          {action}
        </div>
      ) : (
        <h3 className={styles.cardTitle}>{title}</h3>
      )}
      {children}
    </section>
  );
}

/** Printing and the quote: the first links under «⋯». */
export function MenuLinks({ order }: { order: OrderDetail }) {
  return (
    <>
      <Link href={`/ordenes/${order.id}/resguardo`} className={styles.menuItem}>
        <Printer size={14} aria-hidden />
        Imprimir resguardo
      </Link>
      <Link href={`/ordenes/${order.id}/resguardo?formato=etiqueta`} className={styles.menuItem}>
        <Tag size={14} aria-hidden />
        Imprimir etiqueta
      </Link>
      {order.quote ? (
        <Link href={`/presupuestos?presupuesto=${order.quote.id}`} className={styles.menuItem}>
          <FileText size={14} aria-hidden />
          Presupuesto {order.quote.code}
        </Link>
      ) : (
        canQuote(order) && (
          <Link href={`/presupuestos?presupuesto=nuevo&orden=${order.id}`} className={styles.menuItem}>
            <FileText size={14} aria-hidden />
            Hacer presupuesto
          </Link>
        )
      )}
    </>
  );
}

export function ClientCard({
  order,
  children,
  action,
}: {
  order: OrderDetail;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { client } = order;
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ");
  return (
    <Card title="Cliente" action={action}>
      <p className={`${styles.strong} ${styles.clip}`} title={name}>
        {name}
      </p>
      {client.phoneNumber && (
        <p>
          {client.phoneNumber}
          <span className={styles.muted}> · {CONTACT_LABEL[client.preferredContact]}</span>
        </p>
      )}
      {(client.email || client.dni) && (
        <p className={`${styles.muted} ${styles.clip}`}>
          {[client.email, client.dni && `${client.dniType} ${client.dni}`].filter(Boolean).join(" · ")}
        </p>
      )}
      {client.phoneNumber && (
        <p className={styles.actions}>
          <a href={`tel:${client.phoneNumber.replace(/\s/g, "")}`} className={styles.action}>
            <Phone size={14} aria-hidden />
            Llamar
          </a>
          <a href={whatsappHref(client.phoneNumber)} target="_blank" rel="noreferrer" className={styles.action}>
            <MessageCircle size={14} aria-hidden />
            WhatsApp
          </a>
        </p>
      )}
      {children}
    </Card>
  );
}

export function DeviceCard({
  order,
  fullImei = false,
  action,
}: {
  order: OrderDetail;
  fullImei?: boolean;
  action?: ReactNode;
}) {
  const { device } = order;
  return (
    <Card title="Equipo" action={device ? action : undefined}>
      {device ? (
        <>
          <p className={styles.strong}>
            {[DEVICE_TYPE_LABEL[device.type] ?? device.type, `${device.brand} ${device.model}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {device.imei && (
            <p className={styles.mono} title={device.imei}>
              IMEI {fullImei ? device.imei : `…${device.imei.slice(-6)}`}
            </p>
          )}
          {device.unlockSecretType && (
            <div className={styles.unlock}>
              <span className={styles.muted}>
                {device.unlockSecretType === "PATTERN" ? "Patrón" : "Código"} · facilitado
              </span>
              <UnlockSecret deviceId={device.id} />
            </div>
          )}
        </>
      ) : (
        <p className={styles.muted}>Sin dispositivo.</p>
      )}
    </Card>
  );
}

export function MoneyTotals({ order }: { order: OrderDetail }) {
  return (
    <dl className={styles.totals}>
      <div>
        <dt>Total</dt>
        <dd>{formatEur(order.totalPrice)}</dd>
      </div>
      <div>
        <dt>Cobrado</dt>
        <dd>{formatEur(order.amountPaid)}</dd>
      </div>
      <div className={Number(order.balance ?? 0) > 0 ? styles.owed : ""}>
        <dt>Pendiente</dt>
        <dd>{formatEur(order.balance)}</dd>
      </div>
    </dl>
  );
}

/** The fault stands out: the technician reads it before anything. */
export function FaultBlock({ order, action }: { order: OrderDetail; action?: ReactNode }) {
  const faults = order.reportedFaults.map((f) => FAULT_LABEL[f] ?? f);
  const title = (
    <h3 className={styles.faultTitle}>
      <AlertTriangle size={14} aria-hidden />
      Avería declarada
    </h3>
  );
  return (
    <section className={styles.fault}>
      {action ? (
        <div className={styles.blockHead}>
          {title}
          {action}
        </div>
      ) : (
        title
      )}
      <p className={styles.faultText}>{faults.length ? faults.join(" · ") : "Sin indicar"}</p>
      {order.faultNotes && <p>«{order.faultNotes}»</p>}
      {(order.physicalCondition || order.accessories) && (
        <p className={styles.faultMeta}>
          {[
            order.physicalCondition && `Estado: ${order.physicalCondition}`,
            order.accessories && `Entrega: ${order.accessories}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {order.observations && <p className={styles.faultMeta}>Observaciones: {order.observations}</p>}
    </section>
  );
}

/** An important note must not hide behind a tab or below the fold. */
export function FlaggedNotes({ notes }: { notes: OrderNote[] }) {
  const flagged = notes.filter((n) => n.type !== "normal");
  if (!flagged.length) return null;
  return (
    <ul className={styles.flagged} aria-label="Notas importantes">
      {flagged.map((n) => (
        <li key={n.id} className={n.type === "urgent" ? styles.urgent : undefined}>
          {n.content}
        </li>
      ))}
    </ul>
  );
}

/** Services and parts with the total, the cancel reason and the work done. */
export function WorkBlock({ order }: { order: OrderDetail }) {
  return (
    <>
      {order.cancelReason && order.status === "cancelado" && (
        <p className={styles.cancelReason}>
          <span className={styles.muted}>Motivo de cancelación · </span>
          {order.cancelReason}
        </p>
      )}
      {order.lines.length === 0 ? (
        <p className={styles.muted}>Sin servicios todavía.</p>
      ) : (
        <ul className={`${styles.lines} ${styles.box}`} aria-label="Servicios y piezas">
          {order.lines.map((l) => (
            <li key={l.id}>
              <span>
                {l.description}
                {l.quantity > 1 && <span className={styles.muted}> × {l.quantity}</span>}
              </span>
              <span className={styles.amount}>{formatEur(Number(l.unitPrice) * l.quantity)}</span>
            </li>
          ))}
          <li className={styles.lineTotal}>
            <span>Total</span>
            <span className={styles.amount}>{formatEur(order.totalPrice)}</span>
          </li>
        </ul>
      )}
      {order.workDone ? (
        <div className={styles.work}>
          <h4 className={styles.subTitle}>Trabajo realizado</h4>
          <p>{order.workDone}</p>
        </div>
      ) : (
        order.status !== "cancelado" && (
          <p className={styles.muted}>Sin trabajo realizado todavía · se escribe al finalizar.</p>
        )
      )}
    </>
  );
}

export type MoneyStep = "idle" | "charge" | "refund";

/** The charges and refunds, with the forms to add one. */
export function PaymentsBlock({
  order,
  payments,
  money,
  onMoney,
  onChanged,
}: {
  order: OrderDetail;
  payments: OrderPayment[];
  money: MoneyStep;
  onMoney: (step: MoneyStep) => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const pending = Number(order.balance ?? 0);
  const signed = (p: OrderPayment) => (p.kind === "refund" ? -1 : 1) * Number(p.amount);
  return (
    <>
      {payments.length === 0 ? (
        <p className={styles.muted}>Sin cobros todavía.</p>
      ) : (
        <ul className={styles.payments}>
          {payments.map((p) => (
            <li key={p.id}>
              <span>
                {formatDateTime(p.createdAt)}
                <span className={styles.muted}>
                  {" · "}
                  {p.kind === "refund" ? "Devolución · " : ""}
                  {METHOD_LABEL[p.method]}
                  {p.createdBy ? ` · ${p.createdBy.fullName}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
              </span>
              <span className={`${styles.amount} ${signed(p) < 0 ? styles.negative : ""}`}>
                {formatEur(signed(p))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {money === "charge" ? (
        <ChargeForm
          orderId={order.id}
          pending={pending}
          onCancel={() => onMoney("idle")}
          onDone={() => {
            onMoney("idle");
            onChanged();
          }}
        />
      ) : money === "refund" ? (
        <RefundForm
          orderId={order.id}
          payments={payments}
          pending={pending}
          partner={user?.role === "SUPER_ADMIN"}
          onCancel={() => onMoney("idle")}
          onDone={onChanged}
        />
      ) : (
        <p className={styles.actions}>
          {order.status !== "cancelado" && (
            <Button
              icon={<Banknote size={16} aria-hidden />}
              onClick={() => onMoney("charge")}
              disabledReason={pending > 0 ? undefined : "Esta orden ya está pagada."}
            >
              Registrar cobro
            </Button>
          )}
          {/* Design R2: with nothing charged, the action is not offered. */}
          {refundable(payments).length > 0 && (
            <Button variant="ghost" icon={<Undo2 size={16} aria-hidden />} onClick={() => onMoney("refund")}>
              Devolver cobro…
            </Button>
          )}
        </p>
      )}
    </>
  );
}

/** The notices to the client and the internal notes. */
export function NotesBlock({
  order,
  notes,
  noticing,
  onNoticing,
  onChanged,
}: {
  order: OrderDetail;
  notes: OrderNote[];
  noticing: boolean;
  onNoticing: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const { client } = order;
  return (
    <>
      <h4 className={styles.subTitle}>Avisos al cliente</h4>
      {sent && <p role="status">{sent}</p>}
      {client.phoneNumber && noticing ? (
        <NoticeForm
          order={order}
          phone={client.phoneNumber}
          onCancel={() => onNoticing(false)}
          onDone={(message) => {
            onNoticing(false);
            setSent(message);
            onChanged();
          }}
        />
      ) : (
        <p className={styles.actions}>
          <Button
            size="sm"
            icon={<Send size={14} aria-hidden />}
            disabledReason={client.phoneNumber ? undefined : "El cliente no tiene teléfono"}
            onClick={() => {
              setSent(null);
              onNoticing(true);
            }}
          >
            Enviar aviso
          </Button>
          {!client.phoneNumber && (
            <Link href={`/clients/${client.id}`} className={styles.action}>
              Añadir
            </Link>
          )}
        </p>
      )}
      <h4 className={styles.subTitle}>Notas internas</h4>
      <OrderNotes orderId={order.id} initial={notes} />
    </>
  );
}

export type HistoryKind = "estado" | "cobro" | "aviso" | "edicion";

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  text: string;
  at: string;
  by?: string;
  body?: string;
}

const EDIT_ACTIONS = new Set(["updated", "piezas_usadas", "pieza_recibida"]);

/** The order's history with the notices and, when given, the payments; newest first. */
export function historyEntries(order: OrderDetail, notices: OrderNotice[], payments: OrderPayment[] = []): HistoryEntry[] {
  return [
    ...order.serviceHistory.map((h) => ({
      id: h.id,
      kind: (EDIT_ACTIONS.has(h.action) ? "edicion" : "estado") as HistoryKind,
      text: h.description || h.action,
      at: h.performedAt,
    })),
    ...notices.map((n) => ({
      id: `notice-${n.id}`,
      kind: "aviso" as const,
      text: `Aviso «${n.name}» por WhatsApp`,
      at: n.sentAt,
      by: n.sentBy?.fullName,
      body: n.body,
    })),
    ...payments.map((p) => ({
      id: `payment-${p.id}`,
      kind: "cobro" as const,
      text: `${p.kind === "refund" ? "Devolución" : "Cobro"} ${formatEur(Number(p.amount))} · ${METHOD_LABEL[p.method]}${p.note ? ` · ${p.note}` : ""}`,
      at: p.createdAt,
      by: p.createdBy?.fullName,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <p className={styles.muted}>Nada en el historial con este filtro.</p>;
  return (
    <ol className={styles.history}>
      {entries.map((h) => (
        <li key={h.id}>
          <p>{h.text}</p>
          <p className={styles.muted}>{[h.by, formatDateTime(h.at)].filter(Boolean).join(" · ")}</p>
          {h.body && (
            <details>
              <summary className={styles.muted}>Ver texto</summary>
              <p className={styles.sentText}>{h.body}</p>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Shows the unlock code on request for 30 s; the server records who asked. */
export function UnlockSecret({ deviceId }: { deviceId: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (value === null) return;
    const timer = setTimeout(() => setValue(null), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const reveal = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/devices/${deviceId}/unlock-secret/reveal`, {
        method: "POST",
      });
      if (!res.ok) setProblem(await errorMessage(res, "No se ha podido mostrar el código."));
      else setValue(((await res.json()) as { value: string }).value);
    } catch {
      setProblem("Comprueba la conexión.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={styles.secret}>
      <span className={styles.mono} aria-live="polite">
        {value ?? "••••••"}
      </span>
      {value === null ? (
        <Button size="sm" variant="ghost" icon={<Eye size={14} aria-hidden />} loading={busy} onClick={reveal}>
          Mostrar
        </Button>
      ) : (
        <Button size="sm" variant="ghost" icon={<EyeOff size={14} aria-hidden />} onClick={() => setValue(null)}>
          Ocultar
        </Button>
      )}
      <span className={styles.hint}>
        {problem ?? "Quedará registrado con tu nombre y la hora."}
      </span>
    </span>
  );
}
