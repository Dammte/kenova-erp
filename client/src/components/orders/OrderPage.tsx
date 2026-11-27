"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Printer, Tag } from "lucide-react";
import { ClientEditForm, FaultEditForm } from "./OrderEditForms";
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
  type HistoryKind,
  type LoadedOrder,
  type MoneyStep,
} from "./OrderBlocks";
import panel from "./OrderPanel.module.css";
import styles from "./OrderPage.module.css";

/** What the blocks cannot edit yet (services, device) opens the previous screen. */
export const editHref = (id: string) => `/serviceOrders/${id}/edit`;

type Block = "averia" | "cliente";
const BLOCK_NAME: Record<Block, string> = { averia: "la avería", cliente: "el cliente" };

const FILTERS: { id: HistoryKind | "todo"; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "estado", label: "Estados" },
  { id: "cobro", label: "Cobros" },
  { id: "aviso", label: "Avisos" },
  { id: "edicion", label: "Ediciones" },
];

/**
 * Design R3 3.4: the whole order on one page. The same header, actions and
 * blocks as the side panel, with room: the work, notes and history on the
 * left, client, device and money always in view on the right.
 */
export default function OrderPage({ id }: { id: string }) {
  const { data, error, retry } = useOrder(id);
  const order = data?.order;

  return (
    <div className={styles.page}>
      <Link href="/ordenes" className={styles.back}>
        <ArrowLeft size={16} aria-hidden />
        Órdenes
      </Link>
      {error === "missing" ? (
        <Message title="No existe esta orden">
          Puede que esté en la Papelera o que sea de otra tienda. <Link href="/ordenes">Volver a Órdenes</Link>
        </Message>
      ) : error ? (
        <Message title="No se ha podido cargar la orden">
          Comprueba la conexión.{" "}
          <Button size="sm" onClick={retry}>
            Reintentar
          </Button>
        </Message>
      ) : !data || !order ? (
        <p className={panel.loading} aria-busy>
          Cargando…
        </p>
      ) : (
        <Loaded {...data} onChanged={retry} />
      )}
    </div>
  );
}

function Loaded({ order, payments, notes, notices, onChanged }: LoadedOrder & { onChanged: () => void }) {
  const [money, setMoney] = useState<MoneyStep>("idle");
  const [noticing, setNoticing] = useState(false);
  const [filter, setFilter] = useState<HistoryKind | "todo">("todo");
  const [editing, setEditing] = useState<Block | null>(null);
  const [dirty, setDirty] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const closed = order.status === "entregado" || order.status === "cancelado";

  // Leaving the page with something typed and not saved asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // One block at a time: another one with changes has to be saved or discarded first.
  const edit = (block: Block) => {
    if (editing && editing !== block && dirty) {
      setBlocked(`Guarda o descarta los cambios de ${BLOCK_NAME[editing]} antes de editar ${BLOCK_NAME[block]}.`);
      return;
    }
    setBlocked(null);
    setDirty(false);
    setEditing(block);
  };
  const done = () => {
    setEditing(null);
    setBlocked(null);
  };
  const editButton = (block: Block) =>
    !closed && editing !== block ? (
      <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden />} aria-label={`Editar ${BLOCK_NAME[block]}`} onClick={() => edit(block)}>
        Editar
      </Button>
    ) : null;
  const entries = historyEntries(order, notices, payments).filter((h) => filter === "todo" || h.kind === filter);
  const show = (target: string) =>
    // After the form renders, so the scroll lands on it.
    setTimeout(() => document.getElementById(target)?.scrollIntoView?.({ block: "start", behavior: "smooth" }));

  return (
    <>
      <header className={styles.header}>
        <div className={styles.titleLine}>
          <h1 className={styles.code}>{order.code}</h1>
          <StatusChip status={order.status} />
          {order.priority !== "medium" && order.priority !== "low" && (
            <span className={`${panel.priority} ${panel[`p_${order.priority}`]}`}>{PRIORITY_LABEL[order.priority]}</span>
          )}
          {!closed && (
            <Link href={editHref(order.id)} className={styles.edit} title="Servicios, equipo y el resto, hasta que se editen aquí">
              <Pencil size={14} aria-hidden />
              Más cambios en la pantalla anterior
            </Link>
          )}
        </div>
        {order.warrantyOf && (
          <p className={panel.warranty}>
            Garantía de <Link href={`/ordenes/${order.warrantyOf.id}`}>{order.warrantyOf.code}</Link>
            {order.warrantyRejectedReason && ` · no procede: ${order.warrantyRejectedReason}`}
          </p>
        )}
        <p className={panel.sub}>{headline(order)}</p>
        <OrderActions
          order={order}
          payments={payments}
          onChanged={onChanged}
          onCharge={
            order.status === "cancelado"
              ? undefined
              : () => {
                  setMoney("charge");
                  show("orden-dinero");
                }
          }
          onNotify={
            order.client.phoneNumber
              ? () => {
                  setNoticing(true);
                  show("orden-notas");
                }
              : undefined
          }
          notified={notifiedSinceFinished(order, notices)}
          menu={<MenuLinks order={order} />}
        />
      </header>

      <div className={styles.columns}>
        <div className={styles.main}>
          {blocked && (
            <p className={panel.conflict} role="alert">
              {blocked}
            </p>
          )}
          {editing === "averia" ? (
            <section className={panel.section}>
              <h2 className={styles.blockTitle}>Editar avería</h2>
              <FaultEditForm
                order={order}
                onDirty={setDirty}
                onSaved={() => {
                  done();
                  onChanged();
                }}
                onCancel={done}
                onReload={onChanged}
              />
            </section>
          ) : (
            <FaultBlock order={order} action={editButton("averia")} />
          )}
          <FlaggedNotes notes={notes} />

          <section className={panel.section}>
            <h2 className={styles.blockTitle}>Servicios y trabajo</h2>
            <div className={panel.tabPanel}>
              <WorkBlock order={order} />
            </div>
          </section>

          <section className={panel.section} id="orden-notas">
            <h2 className={styles.blockTitle}>Notas internas y avisos</h2>
            <div className={panel.tabPanel}>
              <NotesBlock order={order} notes={notes} noticing={noticing} onNoticing={setNoticing} onChanged={onChanged} />
            </div>
          </section>

          <section className={panel.section}>
            <h2 className={styles.blockTitle}>Historial</h2>
            <div className={styles.filters} role="group" aria-label="Filtrar el historial">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={styles.filter}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <HistoryList entries={entries} />
          </section>
        </div>

        <aside className={styles.side} aria-label="Cliente, equipo y dinero">
          {editing === "cliente" ? (
            <section className={panel.card}>
              <h3 className={panel.cardTitle}>Cliente</h3>
              <ClientEditForm
                order={order}
                onDirty={setDirty}
                onSaved={() => {
                  done();
                  onChanged();
                }}
                onCancel={done}
              />
            </section>
          ) : (
            <ClientCard order={order} action={editButton("cliente")}>
              <p className={panel.actions}>
                <Link href={`/clients/${order.client.id}`} className={panel.action}>
                  Ficha del cliente
                </Link>
              </p>
            </ClientCard>
          )}
          <DeviceCard order={order} fullImei />
          <section className={panel.card} id="orden-dinero">
            <h3 className={panel.cardTitle}>Dinero</h3>
            <MoneyTotals order={order} />
            <div className={styles.payments}>
              <PaymentsBlock order={order} payments={payments} money={money} onMoney={setMoney} onChanged={onChanged} />
            </div>
          </section>
          {order.quote && (
            <Card title="Presupuesto">
              <Link href={`/presupuestos?presupuesto=${order.quote.id}`}>{order.quote.code}</Link>
            </Card>
          )}
          <Card title="Impresos">
            <p className={panel.actions}>
              <Link href={`/ordenes/${order.id}/resguardo`} className={panel.action}>
                <Printer size={14} aria-hidden />
                Resguardo
              </Link>
              <Link href={`/ordenes/${order.id}/resguardo?formato=etiqueta`} className={panel.action}>
                <Tag size={14} aria-hidden />
                Etiqueta
              </Link>
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
