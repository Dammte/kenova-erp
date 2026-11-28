"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Maximize2, Printer, Tag, X } from "lucide-react";
import { Button, StatusChip } from "@/components/ui";
import { PRIORITY_LABEL } from "./orderList";
import { OrderActions } from "./OrderActions";
import {
  Card,
  ClientCard,
  DeviceCard,
  FaultBlock,
  FlaggedNotes,
  HistoryList,
  LocationBadge,
  MenuLinks,
  Message,
  MoneyTotals,
  NotesBlock,
  PaymentsBlock,
  WorkBlock,
  headline,
  historyEntries,
  notifiedSinceFinished,
  useOrder,
  type LoadedOrder,
  type MoneyStep,
} from "./OrderBlocks";
import styles from "./OrderPanel.module.css";

export { REVEAL_MS } from "./OrderBlocks";

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
            {order && <LocationBadge order={order} />}
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

const TABS = [
  { id: "trabajo", label: "Trabajo" },
  { id: "pagos", label: "Pagos" },
  { id: "notas", label: "Notas y avisos" },
  { id: "historial", label: "Historial" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Sections({ order, payments, notes, notices, onChanged }: LoadedOrder & { onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("trabajo");
  const [money, setMoney] = useState<MoneyStep>("idle");
  const [noticing, setNoticing] = useState(false);
  const tabsId = useId();
  const counts: Partial<Record<Tab, number>> = { pagos: payments.length, notas: notes.length + notices.length };

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
        onCharge={
          order.status === "cancelado"
            ? undefined
            : () => {
                setTab("pagos");
                setMoney("charge");
              }
        }
        onNotify={
          order.client.phoneNumber
            ? () => {
                setTab("notas");
                setNoticing(true);
              }
            : undefined
        }
        notified={notifiedSinceFinished(order, notices)}
        menu={<MenuLinks order={order} />}
      />

      <div className={styles.cards}>
        <ClientCard order={order} />
        <DeviceCard order={order} />
        <Card title="Dinero">
          <MoneyTotals order={order} />
        </Card>
      </div>

      <FaultBlock order={order} />
      <FlaggedNotes notes={notes} />

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
        {tab === "trabajo" && <WorkBlock order={order} />}
        {tab === "pagos" && (
          <PaymentsBlock order={order} payments={payments} money={money} onMoney={setMoney} onChanged={onChanged} />
        )}
        {tab === "notas" && (
          <NotesBlock order={order} notes={notes} noticing={noticing} onNoticing={setNoticing} onChanged={onChanged} />
        )}
        {tab === "historial" && <HistoryList entries={historyEntries(order, notices)} />}
      </div>
    </>
  );
}
