"use client";

import { useState, type FormEvent } from "react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { currentMonth, monthLabel } from "./Commissions";
import { formatDay } from "./shipments";
import styles from "./Shipments.module.css";

export type SettlementMethod = "cash" | "card" | "transfer" | "other";

export const SETTLEMENT_METHODS: [SettlementMethod, string][] = [
  ["transfer", "Transferencia"],
  ["cash", "Efectivo"],
  ["card", "Tarjeta"],
  ["other", "Otro"],
];
const METHOD_LABEL = Object.fromEntries(SETTLEMENT_METHODS) as Record<
  SettlementMethod,
  string
>;

/** GET /api/stores/:id/commissions → settlement, once the month is settled. */
export interface CommissionSettlement {
  id: string;
  month: string;
  toKenova: string;
  carriedIn: string;
  due: string;
  received: string;
  /** due − received: carried to the next settlement. */
  pending: string;
  receivedOn: string;
  method: SettlementMethod;
  note: string | null;
  createdBy: { id: string; fullName: string } | null;
}

/** Today in Madrid, as AAAA-MM-DD. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** «Quedan 20,00 € pendientes…», what the settlement leaves for next month. */
export function pendingText(pending: string): string {
  const p = Number(pending);
  if (p > 0)
    return `Quedan ${formatEur(p)} pendientes: se suman a la próxima liquidación.`;
  if (p < 0)
    return `La tienda entregó ${formatEur(-p)} de más: se descuentan de la próxima liquidación.`;
  return "Liquidado del todo: no queda nada pendiente.";
}

/**
 * Design R2 3.14 «Comisiones»: what the store handed over for the month. The
 * partners record it once the month is over; whatever is left pending carries
 * into the next month. Only the latest settlement can be undone.
 */
export function Settlement({
  storeId,
  storeName,
  month,
  due,
  settlement,
  partner,
  onChange,
}: {
  storeId: string;
  storeName: string;
  month: string;
  /** What the store has to hand over now: the month plus what was pending. */
  due: string;
  settlement: CommissionSettlement | null;
  partner: boolean;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState<number | null>(Number(due));
  const [receivedOn, setReceivedOn] = useState(today());
  const [method, setMethod] = useState<SettlementMethod>("transfer");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const url = `${API_URL}/stores/${storeId}/commissions/${month}/settlement`;

  const send = async (init: RequestInit, fallback: string) => {
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(url, init);
      if (!res.ok) {
        setProblem(await errorMessage(res, fallback));
        return;
      }
      setOpen(false);
      setConfirmUndo(false);
      onChange();
    } catch {
      setProblem(`${fallback} Revisa la conexión y vuelve a intentarlo.`);
    } finally {
      setSaving(false);
    }
  };

  const missing =
    received === null
      ? "Escribe lo que ha entregado la tienda."
      : !receivedOn
        ? "Pon la fecha en que se recibió."
        : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (missing || saving) return;
    void send(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          received,
          receivedOn,
          method,
          note: note.trim() || undefined,
        }),
      },
      "No se ha registrado la liquidación.",
    );
  };

  const error = problem && (
    <p className={styles.error} role="alert">
      {problem}
    </p>
  );

  if (settlement) {
    return (
      <section className={styles.settlement} aria-label="Liquidación">
        <h2 className={styles.cardHeading}>Liquidación</h2>
        <p>
          <strong>
            {storeName} entregó {formatEur(settlement.received)} de{" "}
            {formatEur(settlement.due)}
          </strong>{" "}
          el {formatDay(`${settlement.receivedOn}T12:00:00Z`)} ·{" "}
          {METHOD_LABEL[settlement.method]}
          {settlement.createdBy &&
            ` · Anotado por ${settlement.createdBy.fullName}`}
        </p>
        <p>{pendingText(settlement.pending)}</p>
        {settlement.note && <p className={styles.sub}>{settlement.note}</p>}
        {settlement.due !== due && (
          <p className={styles.sub}>
            Las órdenes del mes han cambiado desde que se liquidó: la
            liquidación guarda los totales de entonces (
            {formatEur(settlement.due)}).
          </p>
        )}
        {partner &&
          (confirmUndo ? (
            <div
              className={styles.confirm}
              role="alertdialog"
              aria-label="Deshacer la liquidación"
            >
              <p>
                El mes vuelve a quedar sin liquidar. Solo se puede deshacer la
                última liquidación de la tienda.
              </p>
              <div className={styles.actions}>
                <Button
                  variant="danger"
                  size="sm"
                  loading={saving}
                  onClick={() =>
                    void send(
                      { method: "DELETE" },
                      "No se ha deshecho la liquidación.",
                    )
                  }
                >
                  Deshacer liquidación
                </Button>
                <Button size="sm" onClick={() => setConfirmUndo(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmUndo(true)}
              >
                Deshacer liquidación
              </Button>
            </div>
          ))}
        {error}
      </section>
    );
  }

  if (month >= currentMonth()) {
    return (
      <p className={styles.sub}>
        {monthLabel(month)} se podrá liquidar cuando termine el mes.
      </p>
    );
  }

  if (!partner) {
    return (
      <p className={styles.sub}>
        Pendiente de liquidar: {formatEur(due)} a entregar a Kenova.
      </p>
    );
  }

  if (!open) {
    return (
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Registrar liquidación
        </Button>
      </div>
    );
  }

  return (
    <form
      className={styles.settlement}
      onSubmit={submit}
      aria-label="Registrar liquidación"
    >
      <h2 className={styles.cardHeading}>Registrar liquidación</h2>
      <p className={styles.sub}>
        A entregar: {formatEur(due)}. Si entrega menos, la diferencia pasa al
        mes siguiente.
      </p>
      <div className={styles.settlementFields}>
        <MoneyInput
          label="Ha entregado"
          value={received}
          onChange={setReceived}
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        <TextField
          label="Fecha"
          type="date"
          value={receivedOn}
          max={today()}
          onChange={(e) => setReceivedOn(e.target.value)}
        />
        <label className={styles.field}>
          <span>Forma de pago</span>
          <select
            className={styles.select}
            value={method}
            onChange={(e) => setMethod(e.target.value as SettlementMethod)}
          >
            {SETTLEMENT_METHODS.map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TextField
        label="Nota · opcional"
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
      />
      {received !== null && (
        <p aria-live="polite">
          {pendingText((Number(due) - received).toFixed(2))}
        </p>
      )}
      {error}
      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          loadingText="Registrando…"
          disabledReason={missing}
        >
          Registrar liquidación
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
