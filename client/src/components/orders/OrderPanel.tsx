"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Banknote, ExternalLink, Eye, EyeOff, MessageCircle, Phone, X } from "lucide-react";
import { Button, StatusChip } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  CONTACT_LABEL,
  DEVICE_TYPE_LABEL,
  METHOD_LABEL,
  formatDateTime,
  shopDays,
  whatsappHref,
  type OrderDetail,
  type OrderNote,
  type OrderPayment,
} from "./orderDetail";
import { FAULT_LABEL, PRIORITY_LABEL } from "./orderList";
import { ChargeForm } from "./ChargeForm";
import { OrderActions } from "./OrderActions";
import { OrderNotes } from "./OrderNotes";
import styles from "./OrderPanel.module.css";

/** How long a revealed unlock code stays on screen. */
export const REVEAL_MS = 30_000;

interface Loaded {
  order: OrderDetail;
  payments: OrderPayment[];
  notes: OrderNote[];
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
    ])
      .then(([order, payments, notes]) => setData({ order, payments, notes }))
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
 * Design 1.5 as a side panel over the list: what is wrong with the device,
 * what has to be done, the money, then the device, the client and the notes.
 * The next step for the status is done here; editing, charging and printing
 * still happen on the order's page.
 */
export default function OrderPanel({
  id,
  code,
  fullHref,
  onClose,
  onChanged,
}: {
  id: string;
  /** The number from the list, shown while the order loads. */
  code?: string;
  /** The order's page, for what the panel cannot do yet. */
  fullHref: string;
  onClose: () => void;
  /** After the panel changed the order, so the list can refresh. */
  onChanged?: () => void;
}) {
  const { data, error, retry } = useOrder(id);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus moves into the panel once; Esc closes it.
  useEffect(() => {
    closeRef.current?.focus();
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
            <h2 className={styles.code}>{title}</h2>
            {order && <StatusChip status={order.status} />}
            {order && order.priority !== "medium" && order.priority !== "low" && (
              <span className={`${styles.priority} ${styles[`p_${order.priority}`]}`}>
                {PRIORITY_LABEL[order.priority]}
              </span>
            )}
            <button
              ref={closeRef}
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={20} aria-hidden />
            </button>
          </div>
          {order && <p className={styles.sub}>{headline(order)}</p>}
          <Link href={fullHref} className={styles.full}>
            <ExternalLink size={14} aria-hidden />
            Abrir la orden completa para editar o imprimir
          </Link>
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
            <>
              <OrderActions order={data.order} onChanged={changed} />
              <Sections {...data} onChanged={changed} />
            </>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Sections({ order, payments, notes, onChanged }: Loaded & { onChanged: () => void }) {
  const [charging, setCharging] = useState(false);
  const pending = Number(order.balance ?? 0);
  const faults = order.reportedFaults.map((f) => FAULT_LABEL[f] ?? f);
  const signed = (p: OrderPayment) => (p.kind === "refund" ? -1 : 1) * Number(p.amount);
  const { client, device } = order;
  const clientName = [client.firstName, client.lastName].filter(Boolean).join(" ");

  return (
    <>
      {/* The fault comes first and stands out: the technician reads it before anything. */}
      <section className={styles.fault}>
        <h3 className={styles.faultTitle}>
          <AlertTriangle size={16} aria-hidden />
          Avería declarada en la entrada
        </h3>
        <p className={styles.faultText}>{faults.length ? faults.join(", ") : "Sin indicar"}</p>
        {order.faultNotes && <p>{order.faultNotes}</p>}
        <dl className={styles.fields}>
          {order.physicalCondition && <Field label="Estado físico">{order.physicalCondition}</Field>}
          {order.accessories && <Field label="Accesorios">{order.accessories}</Field>}
          {order.observations && <Field label="Observaciones">{order.observations}</Field>}
        </dl>
      </section>

      {order.cancelReason && order.status === "cancelado" && (
        <Section title="Motivo de cancelación">
          <p>{order.cancelReason}</p>
        </Section>
      )}
      {order.workDone && (
        <Section title="Trabajo realizado">
          <p>{order.workDone}</p>
        </Section>
      )}

      <Section title="Servicios y piezas">
        {order.lines.length === 0 ? (
          <p className={styles.muted}>Sin servicios todavía.</p>
        ) : (
          <ul className={styles.lines}>
            {order.lines.map((l) => (
              <li key={l.id}>
                <span>
                  {l.description}
                  {l.quantity > 1 && <span className={styles.muted}> × {l.quantity}</span>}
                </span>
                <span className={styles.amount}>{formatEur(Number(l.unitPrice) * l.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Pagos">
        {payments.length > 0 && (
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
        <dl className={styles.totals}>
          <div>
            <dt>Total</dt>
            <dd>{formatEur(order.totalPrice)}</dd>
          </div>
          <div>
            <dt>Pagado</dt>
            <dd>{formatEur(order.amountPaid)}</dd>
          </div>
          <div className={Number(order.balance) > 0 ? styles.owed : ""}>
            <dt>Pendiente</dt>
            <dd>{formatEur(order.balance)}</dd>
          </div>
        </dl>
        {order.status !== "cancelado" &&
          (charging ? (
            <ChargeForm
              orderId={order.id}
              pending={pending}
              onCancel={() => setCharging(false)}
              onDone={() => {
                setCharging(false);
                onChanged();
              }}
            />
          ) : (
            <p className={styles.actions}>
              <Button
                icon={<Banknote size={16} aria-hidden />}
                onClick={() => setCharging(true)}
                disabledReason={pending > 0 ? undefined : "Esta orden ya está pagada."}
              >
                Registrar cobro
              </Button>
            </p>
          ))}
      </Section>

      <Section title="Dispositivo">
        {device ? (
          <dl className={styles.fields}>
            <Field label="Equipo">
              {[DEVICE_TYPE_LABEL[device.type] ?? device.type, `${device.brand} ${device.model}`]
                .filter(Boolean)
                .join(" · ")}
            </Field>
            {device.imei && (
              <Field label="IMEI">
                <span className={styles.mono}>{device.imei}</span>
              </Field>
            )}
            {device.unlockSecretType && (
              <Field label={device.unlockSecretType === "PATTERN" ? "Desbloqueo · patrón" : "Desbloqueo · código"}>
                <UnlockSecret deviceId={device.id} />
              </Field>
            )}
          </dl>
        ) : (
          <p className={styles.muted}>Sin dispositivo.</p>
        )}
      </Section>

      <Section title="Cliente">
        <p className={styles.strong}>{clientName}</p>
        {client.phoneNumber && (
          <p>
            {client.phoneNumber}
            <span className={styles.muted}> · {CONTACT_LABEL[client.preferredContact]}</span>
          </p>
        )}
        {(client.email || client.dni) && (
          <p className={styles.muted}>
            {[client.email, client.dni && `${client.dniType} ${client.dni}`].filter(Boolean).join(" · ")}
          </p>
        )}
        {client.phoneNumber && (
          <p className={styles.actions}>
            <a href={`tel:${client.phoneNumber.replace(/\s/g, "")}`} className={styles.action}>
              <Phone size={14} aria-hidden />
              Llamar
            </a>
            <a
              href={whatsappHref(client.phoneNumber)}
              target="_blank"
              rel="noreferrer"
              className={styles.action}
            >
              <MessageCircle size={14} aria-hidden />
              WhatsApp
            </a>
          </p>
        )}
      </Section>

      <Section title="Notas internas">
        <OrderNotes orderId={order.id} initial={notes} />
      </Section>

      <Section title="Historial">
        <ol className={styles.history}>
          {[...order.serviceHistory]
            .sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt))
            .map((h) => (
              <li key={h.id}>
                <p>{h.description || h.action}</p>
                <p className={styles.muted}>{formatDateTime(h.performedAt)}</p>
              </li>
            ))}
        </ol>
      </Section>
    </>
  );
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
