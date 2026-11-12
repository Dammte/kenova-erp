"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  KIND_LABEL,
  METHOD_LABEL,
  lineTime,
  type CashDay,
  type CashLine,
  type CashMethod,
} from "./cash";
import styles from "./Cash.module.css";

const METHODS: CashMethod[] = ["cash", "card", "transfer", "other"];

/**
 * Design 3.2 «Corregir un día cerrado» (partners only): the method of a
 * charge or refund, or the amount of an entry or exit, with the reason. A
 * charge's amount is fixed with a refund from the order, never here.
 */
export function CorrectionForm({
  line,
  day,
  storeId,
  onCancel,
  onSaved,
}: {
  line: CashLine;
  day: string;
  storeId: string;
  onCancel: () => void;
  onSaved: (day: CashDay) => void;
}) {
  const manual = line.kind === "in" || line.kind === "out";
  const [method, setMethod] = useState<CashMethod>(line.method);
  const [amount, setAmount] = useState<number | null>(
    Math.abs(Number(line.amount)),
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  // On a phone the form is below the movements: bring it into view.
  useEffect(
    () =>
      ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }),
    [],
  );

  const changed = manual
    ? amount !== null &&
      amount.toFixed(2) !== Math.abs(Number(line.amount)).toFixed(2)
    : method !== line.method;
  const blocked = !changed
    ? manual
      ? "Escribe el importe correcto"
      : "Elige la forma de pago correcta"
    : reason.trim() === ""
      ? "Escribe el motivo"
      : manual && (amount === null || amount <= 0)
        ? "Escribe un importe mayor que 0"
        : undefined;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/cash/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeId || undefined,
          lineId: line.id,
          ...(manual ? { amount } : { method }),
          reason: reason.trim(),
        }),
      });
      if (!res.ok) {
        setProblem(
          await errorMessage(res, "No se ha podido guardar la corrección."),
        );
        return;
      }
      onSaved((await res.json()) as CashDay);
    } catch {
      setProblem(
        "No se ha podido guardar la corrección: se ha perdido la conexión.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      ref={ref}
      className={`${styles.card} ${styles.noPrint}`}
      onSubmit={save}
      aria-labelledby="fix-title"
    >
      <h2 id="fix-title" className={styles.cardTitle}>
        Corregir {KIND_LABEL[line.kind].toLowerCase()}
      </h2>
      <p className={styles.muted}>
        {lineTime(line, day)} ·{" "}
        {line.orderCode ? `${line.orderCode} · ${line.clientName}` : line.note}{" "}
        · {formatEur(line.amount)}
      </p>
      {manual ? (
        <MoneyInput
          label="Importe correcto"
          value={amount}
          onChange={setAmount}
        />
      ) : (
        <>
          <div
            className={`${styles.segment} ${styles.methods}`}
            role="radiogroup"
            aria-label="Forma de pago correcta"
          >
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          <p className={styles.muted}>
            El importe de un cobro se corrige con una devolución desde la orden.
          </p>
        </>
      )}
      <TextField
        label="Motivo"
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
      />
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        loading={saving}
        disabledReason={blocked}
      >
        Guardar corrección
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  );
}
