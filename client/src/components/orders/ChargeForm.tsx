"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, MoneyInput } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import styles from "./OrderPanel.module.css";

export const METHODS = [
  ["cash", "Efectivo"],
  ["card", "Tarjeta"],
  ["transfer", "Transferencia"],
  ["other", "Otro"],
] as const;
export type Method = (typeof METHODS)[number][0];

/** Half the pending amount, rounded down to the cent. */
const half = (pending: number) => Math.floor(pending * 50) / 100;

/**
 * Design 2.1: records a charge on the order. Opens with the whole pending
 * amount written in; a charge can never leave the balance below zero.
 */
export function ChargeForm({
  orderId,
  pending,
  onDone,
  onCancel,
}: {
  orderId: string;
  pending: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  // One id per charge: retrying after a lost connection records the same
  // payment again instead of a second one.
  const [paymentId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState<number | null>(pending);
  const [method, setMethod] = useState<Method | null>(null);
  const [given, setGiven] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const missing =
    amount === null || amount <= 0
      ? "Escribe un importe mayor que 0."
      : method === null
        ? "Elige la forma de pago."
        : undefined;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (missing || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paymentId, kind: "charge", amount, method, note: note.trim() || null }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha registrado el cobro."));
        return;
      }
      onDone();
    } catch {
      setProblem(
        "No se ha registrado el cobro: se ha perdido la conexión. No cobres otra vez en el datáfono; reintenta y se apuntará el mismo cobro.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      // Esc closes the form, not the whole panel.
      e.stopPropagation();
      onCancel();
    }
  };

  const change = amount !== null && given !== null ? given - amount : null;

  return (
    <form className={`${styles.finish} ${styles.charge}`} onSubmit={submit} onKeyDown={onKey} aria-label="Registrar cobro">
      <MoneyInput label="Importe" value={amount} onChange={setAmount} max={pending} autoFocus onFocus={(e) => e.target.select()} />
      <div className={styles.chips}>
        <button type="button" className={styles.chip} onClick={() => setAmount(pending)}>
          Todo el pendiente · {formatEur(pending)}
        </button>
        {pending >= 0.02 && (
          <button type="button" className={styles.chip} onClick={() => setAmount(half(pending))}>
            50 % · {formatEur(half(pending))}
          </button>
        )}
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.label}>Forma de pago</legend>
        <div className={styles.chips}>
          {METHODS.map(([m, label]) => (
            <label key={m} className={styles.chip}>
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {method === "cash" && (
        <>
          <MoneyInput label="Entrega el cliente · opcional" value={given} onChange={setGiven} />
          {change !== null && (
            <p className={change < 0 ? styles.error : styles.strong} aria-live="polite">
              {change < 0 ? `Faltan ${formatEur(-change)}` : `Cambio: ${formatEur(change)}`}
            </p>
          )}
        </>
      )}

      <label className={styles.label} htmlFor={`charge-note-${orderId}`}>
        Nota <span className={styles.muted}>· opcional</span>
      </label>
      <input
        id={`charge-note-${orderId}`}
        className={styles.input}
        value={note}
        maxLength={300}
        onChange={(e) => setNote(e.target.value)}
      />

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.actions}>
        <Button type="submit" variant="primary" loading={saving} loadingText="Registrando…" disabledReason={missing}>
          {amount ? `Cobrar ${formatEur(amount)}` : "Cobrar"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </p>
    </form>
  );
}
