"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, Banknote, Undo2, Eye, EyeOff, FileText, Maximize2, MessageCircle, Phone, Printer, Send, Tag, X } from "lucide-react";
import { Button, StatusChip } from "@/components/ui";
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
import { FAULT_LABEL, PRIORITY_LABEL } from "./orderList";
import type { OrderNotice } from "@/components/notices/notices";
import { NoticeForm } from "./NoticeForm";
import { ChargeForm } from "./ChargeForm";
import { RefundForm, refundable } from "./RefundForm";
import { OrderActions } from "./OrderActions";
import { OrderNotes } from "./OrderNotes";
import styles from "./OrderPanel.module.css";

/** How long a revealed unlock code stays on screen. */
export const REVEAL_MS = 30_000;

interface Loaded {
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

function useOrder(id: string) {
  const [data, setData] = useState<Loaded | null>(null);
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

/**
 * Design R3 3.3, a side panel over the list: the main action for the status,
 * client, device and money at a glance, the declared fault, then the work,
 * payments, notes and history in tabs. Editing happens on the order's page.
 */
export default function OrderPanel({
  id,
  code,
  fullHref,
  onClose,
  onChanged,
  justCreated = false,
}: {
  id: string;
  /** The number from the list, shown while the order loads. */
  code?: string;
  /** The order's page, for what the panel cannot do yet. */
  fullHref: string;
  onClose: () => void;
  /** After the panel changed the order, so the list can refresh. */
  onChanged?: () => void;
  /** Opened right after creating the order: the focus goes to printing. */
  justCreated?: boolean;
}) {
  const { data, error, retry } = useOrder(id);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const printRef = useRef<HTMLAnchorElement>(null);
  const focusPrint = useRef(justCreated);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Design 4: focus goes to the panel's title once, so a screen reader reads
  // which order opened; Esc closes it.
  useEffect(() => {
    (focusPrint.current ? printRef : titleRef).current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changed = () => {
    retry();
    onChanged?.();
  };
  const order = data?.order;
  const title = order?.code ?? code ?? "Orden";

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <aside className={styles.panel} role="dialog" aria-modal="true" aria-label={`Orden ${title}`}>
        <header className={styles.header}>
          <div className={styles.headLine}>
            <h2 ref={titleRef} tabIndex={-1} className={styles.code}>
              {title}
            </h2>
            {order && <StatusChip status={order.status} />}
            {order && order.priority !== "medium" && order.priority !== "low" && (
              <span className={`${styles.priority} ${styles[`p_${order.priority}`]}`}>
                {PRIORITY_LABEL[order.priority]}
              </span>
            )}
            <Link href={fullHref} className={styles.fullLink} title="Abrir la orden completa para editar">
              <Maximize2 size={14} aria-hidden />
              Ficha
            </Link>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={20} aria-hidden />
            </button>
          </div>
          {order?.warrantyOf && (
            <p className={styles.warranty}>
              Garantía de{" "}
              <Link href={`/ordenes?orden=${order.warrantyOf.id}`} replace scroll={false}>
                {order.warrantyOf.code}
              </Link>
              {order.warrantyRejectedReason && ` · no procede: ${order.warrantyRejectedReason}`}
            </p>
          )}
          {order && <p className={styles.sub}>{headline(order)}</p>}
          {/* Design R3: right after creating it, the receipt is what comes next. */}
          {justCreated && (
            <p className={styles.created} role="status">
              <span>Orden creada.</span>
              <Link ref={printRef} href={`/ordenes/${id}/resguardo`} className={styles.full}>
                <Printer size={14} aria-hidden />
                Imprimir resguardo
              </Link>
              <Link href={`/ordenes/${id}/resguardo?formato=etiqueta`} className={styles.full}>
                <Tag size={14} aria-hidden />
                Imprimir etiqueta
              </Link>
            </p>
          )}
        </header>

        <div className={styles.body} aria-busy={!data && !error}>
          {error === "missing" ? (
            <Message title={`No encontramos la orden ${title}`}>
              Puede que se haya eliminado o que sea de otra tienda.
            </Message>
          ) : error ? (
            <Message title="No se ha podido cargar la orden">
              Comprueba la conexión.{" "}
              <Button size="sm" onClick={retry}>
                Reintentar
              </Button>
            </Message>
          ) : !data ? (
            <p className={styles.loading}>Cargando…</p>
          ) : (
            <Sections {...data} onChanged={changed} />
          )}
        </div>
      </aside>
    </>
  );
}

function headline(order: OrderDetail): string {
  const days = shopDays(order);
  const entry = `entrada ${formatDateTime(order.createdAt)}`;
  if (days === null) return entry;
  const what = order.status === "finalizado" ? "sin recoger" : "en taller";
  return `${days} ${days === 1 ? "día" : "días"} ${what} · ${entry}`;
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.message} role="alert">
      <p className={styles.messageTitle}>{title}</p>
      <p>{children}</p>
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      <h3 className={styles.cardTitle}>{title}</h3>
      {children}
    </section>
  );
}

const TABS = [
  { id: "trabajo", label: "Trabajo" },
  { id: "pagos", label: "Pagos" },
  { id: "notas", label: "Notas y avisos" },
  { id: "historial", label: "Historial" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Whether the client was sent a notice after the order was finished. */
export function notifiedSinceFinished(order: OrderDetail, notices: OrderNotice[]): boolean {
  if (!order.finishedAt) return notices.length > 0;
  const finished = Date.parse(order.finishedAt);
  return notices.some((n) => Date.parse(n.sentAt) >= finished);
}

function Sections({ order, payments, notes, notices, onChanged }: Loaded & { onChanged: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("trabajo");
  const [money, setMoney] = useState<"idle" | "charge" | "refund">("idle");
  const [noticing, setNoticing] = useState(false);
  const [noticeSent, setNoticeSent] = useState<string | null>(null);
  const tabsId = useId();
  const pending = Number(order.balance ?? 0);
  const faults = order.reportedFaults.map((f) => FAULT_LABEL[f] ?? f);
  const signed = (p: OrderPayment) => (p.kind === "refund" ? -1 : 1) * Number(p.amount);
  const { client, device } = order;
  const clientName = [client.firstName, client.lastName].filter(Boolean).join(" ");
  const flagged = notes.filter((n) => n.type !== "normal");
  const counts: Partial<Record<Tab, number>> = { pagos: payments.length, notas: notes.length + notices.length };

  const charge = () => {
    setTab("pagos");
    setMoney("charge");
  };
  const notify = () => {
    setTab("notas");
    setNoticeSent(null);
    setNoticing(Boolean(client.phoneNumber));
  };
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const at = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(at + step + TABS.length) % TABS.length].id;
    setTab(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  };

  return (
    <>
      <OrderActions
        order={order}
        payments={payments}
        onChanged={onChanged}
        onCharge={order.status === "cancelado" ? undefined : charge}
        onNotify={client.phoneNumber ? notify : undefined}
        notified={notifiedSinceFinished(order, notices)}
        menu={
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
        }
      />

      <div className={styles.cards}>
        <Card title="Cliente">
          <p className={`${styles.strong} ${styles.clip}`} title={clientName}>
            {clientName}
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
        </Card>

        <Card title="Equipo">
          {device ? (
            <>
              <p className={styles.strong}>
                {[DEVICE_TYPE_LABEL[device.type] ?? device.type, `${device.brand} ${device.model}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {device.imei && (
                <p className={styles.mono} title={device.imei}>
                  IMEI …{device.imei.slice(-6)}
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

        <Card title="Dinero">
          <dl className={styles.totals}>
            <div>
              <dt>Total</dt>
              <dd>{formatEur(order.totalPrice)}</dd>
            </div>
            <div>
              <dt>Cobrado</dt>
              <dd>{formatEur(order.amountPaid)}</dd>
            </div>
            <div className={pending > 0 ? styles.owed : ""}>
              <dt>Pendiente</dt>
              <dd>{formatEur(order.balance)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* The fault stands out: the technician reads it before anything. */}
      <section className={styles.fault}>
        <h3 className={styles.faultTitle}>
          <AlertTriangle size={14} aria-hidden />
          Avería declarada
        </h3>
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

      {/* An important note must not hide behind a tab. */}
      {flagged.length > 0 && (
        <ul className={styles.flagged} aria-label="Notas importantes">
          {flagged.map((n) => (
            <li key={n.id} className={n.type === "urgent" ? styles.urgent : undefined}>
              {n.content}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Detalle de la orden" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${tabsId}-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${tabsId}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {counts[t.id] ? <span className={styles.tabCount}>{counts[t.id]}</span> : null}
          </button>
        ))}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} className={styles.tabPanel}>
        {tab === "trabajo" && (
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
        )}

        {tab === "pagos" && (
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
                onCancel={() => setMoney("idle")}
                onDone={() => {
                  setMoney("idle");
                  onChanged();
                }}
              />
            ) : money === "refund" ? (
              <RefundForm
                orderId={order.id}
                payments={payments}
                pending={pending}
                partner={user?.role === "SUPER_ADMIN"}
                onCancel={() => setMoney("idle")}
                onDone={onChanged}
              />
            ) : (
              <p className={styles.actions}>
                {order.status !== "cancelado" && (
                  <Button
                    icon={<Banknote size={16} aria-hidden />}
                    onClick={() => setMoney("charge")}
                    disabledReason={pending > 0 ? undefined : "Esta orden ya está pagada."}
                  >
                    Registrar cobro
                  </Button>
                )}
                {/* Design R2: with nothing charged, the action is not offered. */}
                {refundable(payments).length > 0 && (
                  <Button variant="ghost" icon={<Undo2 size={16} aria-hidden />} onClick={() => setMoney("refund")}>
                    Devolver cobro…
                  </Button>
                )}
              </p>
            )}
          </>
        )}

        {tab === "notas" && (
          <>
            <h4 className={styles.subTitle}>Avisos al cliente</h4>
            {noticeSent && <p role="status">{noticeSent}</p>}
            {client.phoneNumber && noticing ? (
              <NoticeForm
                order={order}
                phone={client.phoneNumber}
                onCancel={() => setNoticing(false)}
                onDone={(message) => {
                  setNoticing(false);
                  setNoticeSent(message);
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
                    setNoticeSent(null);
                    setNoticing(true);
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
        )}

        {tab === "historial" && (
          <ol className={styles.history}>
            {historyEntries(order, notices).map((h) => (
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
        )}
      </div>
    </>
  );
}

interface HistoryEntry {
  id: string;
  text: string;
  at: string;
  by?: string;
  body?: string;
}

/** The order's history with the notices sent, newest first. */
export function historyEntries(order: OrderDetail, notices: OrderNotice[]): HistoryEntry[] {
  return [
    ...order.serviceHistory.map((h) => ({ id: h.id, text: h.description || h.action, at: h.performedAt })),
    ...notices.map((n) => ({
      id: `notice-${n.id}`,
      text: `Aviso «${n.name}» por WhatsApp`,
      at: n.sentAt,
      by: n.sentBy?.fullName,
      body: n.body,
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Shows the unlock code on request for 30 s; the server records who asked. */
function UnlockSecret({ deviceId }: { deviceId: string }) {
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
