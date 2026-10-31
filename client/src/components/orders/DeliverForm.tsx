"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { METHODS, type Method } from "./ChargeForm";
import { formatDateTime, type OrderDetail } from "./orderDetail";
import styles from "./OrderPanel.module.css";

/** Services shown before folding the rest into "+N". */
const SHOWN_LINES = 3;

/**
 * Design 2.2: hands the device back with the money settled and the client's
 * agreement, in one step. Charging what is owed is the default; handing over
 * with money owed needs a reason, which stays in the history.
 */
export function DeliverForm({
  order,
  onDone,
  onCancel,
}: {
  order: OrderDetail;
  onDone: () => void;
  onCancel: () => void;
}) {
  const owed = Number(order.balance ?? 0);
  // Same id on every retry: a charge that reached the server is not repeated.
  const [paymentId] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<"charge" | "owe">("charge");
  const [method, setMethod] = useState<Method | null>(null);
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const charging = owed > 0 && mode === "charge";
  const missing = [
    charging && method === null && "elige la forma de pago",
    owed > 0 && mode === "owe" && !reason.trim() && "indica por qué se entrega con saldo",
    !agreed && "marca «Cliente conforme»",
  ].filter(Boolean);
  const label = charging
    ? `Cobrar ${formatEur(owed)} y entregar`
    : owed > 0
      ? "Entregar con saldo pendiente"
      : "Entregar";

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (missing.length || saving) return;
    setSaving(true);
    setProblem(null);
    const post = (url: string, method: string, body: object) =>
      apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      if (charging) {
        const res = await post(`${API_URL}/service-orders/${order.id}/payments`, "POST", {
          id: paymentId,
          kind: "charge",
          amount: owed,
          method,
        });
        if (!res.ok) {
          setProblem(await errorMessage(res, "No se ha registrado el cobro."));
          return;
        }
      }
      const res = await post(`${API_URL}/service-orders/${order.id}`, "PATCH", {
        status: "entregado",
        ...(owed > 0 && mode === "owe" ? { owedReason: reason.trim() } : {}),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido entregar la orden."));
        return;
      }
      onDone();
    } catch {
      setProblem(
        charging
          ? "Se ha perdido la conexión. No cobres otra vez en el datáfono: reintenta y se apuntará el mismo cobro."
          : "No se ha podido entregar la orden. Comprueba la conexión.",
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

  const extra = order.lines.length - SHOWN_LINES;
  const returns = [
    order.accessories && `devolver: ${order.accessories}`,
    order.physicalCondition && `estado de entrada: ${order.physicalCondition}`,
  ].filter(Boolean);

  return (
    <form className={styles.finish} onSubmit={submit} onKeyDown={onKey} aria-label="Entregar">
      {order.workDone && (
        <>
          <p className={styles.label}>Trabajo realizado</p>
          <p>{order.workDone}</p>
        </>
      )}
      {order.lines.length > 0 && (
        <ul className={styles.lines}>
          {order.lines.slice(0, SHOWN_LINES).map((l) => (
            <li key={l.id}>
              <span>{l.description}</span>
              <span className={styles.amount}>{formatEur(Number(l.unitPrice) * l.quantity)}</span>
            </li>
          ))}
          {extra > 0 && (
            <li className={styles.muted}>
              + {extra} {extra === 1 ? "servicio" : "servicios"}
            </li>
          )}
        </ul>
      )}
      <p className={styles.muted}>
        {[order.finishedAt && `Finalizada el ${formatDateTime(order.finishedAt)}`, ...returns]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {owed > 0 ? (
        <fieldset className={styles.group}>
          <legend className={styles.label}>Pendiente {formatEur(owed)}</legend>
          <div className={styles.chips}>
            <label className={styles.chip}>
              <input type="radio" name="deliver-mode" checked={mode === "charge"} onChange={() => setMode("charge")} />
              Cobrar ahora {formatEur(owed)}
            </label>
            <label className={styles.chip}>
              <input type="radio" name="deliver-mode" checked={mode === "owe"} onChange={() => setMode("owe")} />
              Entregar con saldo pendiente
            </label>
          </div>
          {mode === "charge" ? (
            <div className={styles.chips} role="radiogroup" aria-label="Forma de pago">
              {METHODS.map(([m, text]) => (
                <label key={m} className={styles.chip}>
                  <input type="radio" name="deliver-method" checked={method === m} onChange={() => setMethod(m)} />
                  {text}
                </label>
              ))}
            </div>
          ) : (
            <>
              <label className={styles.label} htmlFor={`owe-${order.id}`}>
                Motivo <span className={styles.muted}>· queda en el historial con tu nombre</span>
              </label>
              <input
                id={`owe-${order.id}`}
                className={styles.input}
                value={reason}
                maxLength={300}
                placeholder="Pagará por transferencia mañana"
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          )}
        </fieldset>
      ) : (
        <p className={styles.strong}>Pagado del todo.</p>
      )}

      <label className={styles.check}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        Cliente conforme · ha revisado el equipo
      </label>

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          loadingText="Registrando…"
          disabledReason={missing.length ? `Falta: ${missing.join(", ")}.` : undefined}
        >
          {label}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
      </p>
    </form>
  );
}
