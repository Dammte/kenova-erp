"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, MoneyInput } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { METHODS, type Method } from "./ChargeForm";
import { METHOD_LABEL, formatDateTime, type OrderPayment } from "./orderDetail";
import styles from "./OrderPanel.module.css";

const cents = (v: string | number | undefined) => Math.round(Number(v ?? 0) * 100);

/** A charge with what is left to give back of it. */
export interface Refundable {
  charge: OrderPayment;
  left: number;
}

/** The charges that still have something to give back, oldest first. */
export function refundable(payments: OrderPayment[]): Refundable[] {
  return payments
    .filter((p) => p.kind === "charge")
    .map((charge) => ({ charge, left: (cents(charge.amount) - cents(charge.refunded)) / 100 }))
    .filter((r) => r.left > 0);
}

/** «por tarjeta», as the result line reads. */
const BY: Record<OrderPayment["method"], string> = {
  cash: "en efectivo",
  card: "por tarjeta",
  transfer: "por transferencia",
  other: "por otro medio",
  credit: "al saldo a favor",
};

/** «Devueltos 59,00 € por tarjeta · pendiente 149,00 €». */
export function refundedText(amount: number, method: OrderPayment["method"], pending: number): string {
  return `Devueltos ${formatEur(amount)} ${BY[method]} · pendiente ${formatEur(pending)}`;
}

/**
 * Design R2 «Devolver cobro»: gives back all or part of one charge, with a
 * reason. A charge paid with saldo a favor goes back to the saldo. Store
 * accounts refund only charges of the cash day still open; the partners,
 * any day. The result replaces the form.
 */
export function RefundForm({
  orderId,
  payments,
  pending,
  partner,
  onDone,
  onCancel,
}: {
  orderId: string;
  payments: OrderPayment[];
  /** What the order has pending now, before the refund. */
  pending: number;
  partner: boolean;
  /** Called once the refund is recorded, so the order reloads. */
  onDone: () => void;
  onCancel: () => void;
}) {
  const options = refundable(payments);
  // Same id on every retry: a refund that reached the server is not repeated.
  const [refundId] = useState(() => crypto.randomUUID());
  const [chargeId, setChargeId] = useState(() => options[options.length - 1]?.charge.id ?? "");
  const chosen = options.find((o) => o.charge.id === chargeId) ?? options[options.length - 1];
  const [amount, setAmount] = useState<number | null>(chosen?.left ?? null);
  const [method, setMethod] = useState<OrderPayment["method"]>(chosen?.charge.method ?? "cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (result) {
    return (
      <div className={`${styles.finish} ${styles.charge}`} role="status" aria-label="Devolución registrada">
        <p className={styles.strong}>{result}</p>
        <p className={styles.actions}>
          <Button onClick={onCancel} autoFocus>
            Hecho
          </Button>
        </p>
      </div>
    );
  }
  if (!chosen) return null;

  const credit = chosen.charge.method === "credit";
  const locked = !partner && chosen.charge.dayClosed === true;
  const missing = locked
    ? "Lo devuelve un socio."
    : amount === null || amount <= 0
      ? "Escribe un importe mayor que 0."
      : amount > chosen.left
        ? `Máximo ${formatEur(chosen.left)}.`
        : !reason.trim()
          ? "Escribe el motivo."
          : undefined;

  const choose = (r: Refundable) => {
    setChargeId(r.charge.id);
    setAmount(r.left);
    setMethod(r.charge.method);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (missing || saving || amount === null) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: refundId,
          kind: "refund",
          amount,
          method,
          note: reason.trim(),
          refundOf: chosen.charge.id,
        }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha registrado la devolución."));
        return;
      }
      setResult(refundedText(amount, method, pending + amount));
      onDone();
    } catch {
      setProblem("No se ha registrado la devolución. No devuelvas el dinero todavía: reintenta.");
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

  const describe = (r: Refundable) =>
    `${formatDateTime(r.charge.createdAt)} · ${METHOD_LABEL[r.charge.method]} · ${formatEur(r.charge.amount)}` +
    (r.left < Number(r.charge.amount) ? ` · quedan ${formatEur(r.left)}` : "");

  return (
    <form className={`${styles.finish} ${styles.charge}`} onSubmit={submit} onKeyDown={onKey} aria-label="Devolver cobro">
      {options.length > 1 ? (
        <fieldset className={styles.group}>
          <legend className={styles.label}>Cobro que se devuelve</legend>
          <div className={styles.refundList}>
            {options.map((r) => (
              <label key={r.charge.id} className={styles.chip}>
                <input
                  type="radio"
                  name={`refund-of-${orderId}`}
                  checked={r.charge.id === chosen.charge.id}
                  onChange={() => choose(r)}
                />
                {describe(r)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p>
          <span className={styles.label}>Cobro que se devuelve</span>
          <br />
          {describe(chosen)}
        </p>
      )}

      {locked ? (
        <p className={styles.dayClosed} role="note">
          Este cobro es de un día de caja ya cerrado: lo devuelve un socio.
        </p>
      ) : (
        <>
          <MoneyInput
            label="Importe a devolver"
            value={amount}
            onChange={setAmount}
            onFocus={(e) => e.target.select()}
          />
          {credit ? (
            <p className={styles.hint}>Se pagó con saldo a favor: vuelve al saldo del cliente.</p>
          ) : (
            <fieldset className={styles.group}>
              <legend className={styles.label}>Se devuelve</legend>
              <div className={styles.chips}>
                {METHODS.map(([m, label]) => (
                  <label key={m} className={styles.chip}>
                    <input
                      type="radio"
                      name={`refund-method-${orderId}`}
                      checked={method === m}
                      onChange={() => setMethod(m as Method)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className={styles.label} htmlFor={`refund-reason-${orderId}`}>
            Motivo
          </label>
          <input
            id={`refund-reason-${orderId}`}
            className={styles.input}
            value={reason}
            maxLength={300}
            autoFocus
            placeholder="Funda no disponible"
            onChange={(e) => setReason(e.target.value)}
          />
        </>
      )}

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.actions}>
        <Button type="submit" variant="danger" loading={saving} loadingText="Registrando…" disabledReason={missing}>
          {amount && !locked ? `Devolver ${formatEur(amount)}` : "Devolver"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </p>
    </form>
  );
}
