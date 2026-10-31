"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { METHODS, type Method } from "./ChargeForm";
import type { OrderDetail, OrderPayment } from "./orderDetail";
import styles from "./OrderPanel.module.css";

/** What happens to the money already charged when the order is cancelled. */
type Money = "refund" | "credit" | "keep";

/** The method of the last charge paid with money, to hand it back the same way. */
export function lastMethod(payments: OrderPayment[]): Method | null {
  const charge = [...payments]
    .filter((p) => p.kind === "charge" && p.method !== "credit")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return (charge?.method as Method | undefined) ?? null;
}

/**
 * Design R2 "Cancelar con cobros": cancelling needs a reason, and whatever
 * was charged is handed back, kept as the client's credit for a next order,
 * or kept as the diagnosis.
 */
export function CancelForm({
  order,
  payments,
  onDone,
  onCancel,
}: {
  order: OrderDetail;
  payments: OrderPayment[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const paid = Number(order.amountPaid ?? 0);
  // Same id on every retry: a refund that reached the server is not repeated.
  const [refundId] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState("");
  const [money, setMoney] = useState<Money>("refund");
  const [method, setMethod] = useState<Method | null>(() => lastMethod(payments));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refunding = paid > 0 && money !== "keep";
  const missing = [
    !reason.trim() && "el motivo",
    paid > 0 && money === "refund" && method === null && "la forma de devolución",
  ].filter(Boolean);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (missing.length || saving) return;
    setSaving(true);
    setProblem(null);
    const send = (url: string, verb: string, body: object) =>
      apiFetch(url, {
        method: verb,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      if (refunding) {
        const res = await send(`${API_URL}/service-orders/${order.id}/payments`, "POST", {
          id: refundId,
          kind: "refund",
          amount: paid,
          method: money === "credit" ? "credit" : method,
          note: `Cancelación: ${reason.trim()}`,
        });
        if (!res.ok) {
          setProblem(await errorMessage(res, "No se ha registrado la devolución."));
          return;
        }
      }
      const res = await send(`${API_URL}/service-orders/${order.id}`, "PATCH", {
        status: "cancelado",
        cancelReason: reason.trim(),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido cancelar la orden."));
        return;
      }
      onDone();
    } catch {
      setProblem(
        refunding
          ? "Se ha perdido la conexión. No devuelvas el dinero otra vez: reintenta y se apuntará la misma devolución."
          : "No se ha podido cancelar la orden. Comprueba la conexión.",
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
      e.stopPropagation();
      onCancel();
    }
  };

  const name = order.client.firstName;

  return (
    <form className={styles.finish} onSubmit={submit} onKeyDown={onKey} aria-label="Cancelar orden">
      <label className={styles.label} htmlFor={`cancel-${order.id}`}>
        Motivo de la cancelación
      </label>
      <input
        id={`cancel-${order.id}`}
        className={styles.input}
        value={reason}
        maxLength={300}
        autoFocus
        placeholder="El cliente desiste sin dejar el equipo"
        onChange={(e) => setReason(e.target.value)}
      />

      {paid > 0 && (
        <fieldset className={styles.group}>
          <legend className={styles.label}>Cobrado {formatEur(paid)}</legend>
          <div className={styles.chips}>
            <label className={styles.chip}>
              <input type="radio" name="cancel-money" checked={money === "refund"} onChange={() => setMoney("refund")} />
              Devolver {formatEur(paid)}
            </label>
            <label className={styles.chip}>
              <input type="radio" name="cancel-money" checked={money === "credit"} onChange={() => setMoney("credit")} />
              A cuenta de {name} para su próxima orden
            </label>
            <label className={styles.chip}>
              <input type="radio" name="cancel-money" checked={money === "keep"} onChange={() => setMoney("keep")} />
              Retener como diagnóstico
            </label>
          </div>
          {money === "refund" && (
            <div className={styles.chips} role="radiogroup" aria-label="Forma de devolución">
              {METHODS.map(([m, text]) => (
                <label key={m} className={styles.chip}>
                  <input type="radio" name="cancel-method" checked={method === m} onChange={() => setMethod(m)} />
                  {text}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.actions}>
        <Button
          type="submit"
          variant="danger"
          loading={saving}
          disabledReason={missing.length ? `Falta: ${missing.join(" y ")}.` : undefined}
        >
          Cancelar orden
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
      </p>
    </form>
  );
}
