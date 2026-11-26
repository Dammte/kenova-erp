"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { PartsPicker, shortParts, type UsedPart } from "./PartsPicker";
import styles from "./OrderPanel.module.css";

/** The server's ORDER_TESTS, in the order the technician runs them. */
export const TESTS = [
  ["touch", "Táctil"],
  ["cameras", "Cámaras"],
  ["charging", "Carga"],
  ["audio", "Audio"],
  ["biometrics", "Face ID / huella"],
  ["network", "Red"],
] as const;
type Test = (typeof TESTS)[number][0];
type Result = "repaired" | "not_repaired";

/** The PATCH that finishes an order; the work done is printed on the delivery receipt. */
export function finishPayload(
  workDone: string,
  tests: Test[],
  result: Result,
  reason: string,
  used: UsedPart[] = [],
) {
  return {
    status: "finalizado" as const,
    workDone: workDone.trim(),
    testsDone: TESTS.map(([t]) => t).filter((t) => tests.includes(t)),
    result,
    notRepairedReason: result === "not_repaired" ? reason.trim() : null,
    // Taken out of stock by the server in the same step as finishing.
    ...(used.length ? { parts: used.map((u) => ({ inventoryId: u.part.id, quantity: u.quantity })) } : {}),
  };
}

/**
 * Finishing an order: the work done (printed on the delivery receipt), the
 * tests, the result and, for the partners, the parts taken out of stock.
 * Used in the order's panel and in the list's «Finalizar» dialog.
 */
export function FinishForm({
  initialWork,
  saving,
  withParts,
  onCancel,
  onSubmit,
}: {
  initialWork: string;
  saving: boolean;
  /** Only the partners see and use stock. */
  withParts: boolean;
  onCancel: () => void;
  onSubmit: (payload: ReturnType<typeof finishPayload>) => void;
}) {
  const [work, setWork] = useState(initialWork);
  const [tests, setTests] = useState<Test[]>([]);
  const [result, setResult] = useState<Result>("repaired");
  const [reason, setReason] = useState("");
  const [used, setUsed] = useState<UsedPart[]>([]);

  const missing = !work.trim()
    ? "Escribe el trabajo realizado."
    : result === "not_repaired" && !reason.trim()
      ? "Indica por qué no se repara."
      : shortParts(used).length
        ? "Corrige las piezas sin stock."
        : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!missing) onSubmit(finishPayload(work, tests, result, reason, used));
  };
  const toggle = (t: Test) => setTests((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  return (
    <form className={styles.finish} onSubmit={submit}>
      <label className={styles.label} htmlFor="finish-work">
        Trabajo realizado <span className={styles.muted}>(sale en el resguardo de entrega)</span>
      </label>
      <textarea
        id="finish-work"
        className={styles.textarea}
        value={work}
        maxLength={1000}
        autoFocus
        onChange={(e) => setWork(e.target.value)}
      />

      <fieldset className={styles.group}>
        <legend className={styles.label}>Pruebas hechas</legend>
        <div className={styles.chips}>
          {TESTS.map(([t, label]) => (
            <label key={t} className={styles.chip}>
              <input type="checkbox" checked={tests.includes(t)} onChange={() => toggle(t)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.label}>Resultado</legend>
        <div className={styles.chips}>
          <label className={styles.chip}>
            <input type="radio" name="result" checked={result === "repaired"} onChange={() => setResult("repaired")} />
            Reparado
          </label>
          <label className={styles.chip}>
            <input
              type="radio"
              name="result"
              checked={result === "not_repaired"}
              onChange={() => setResult("not_repaired")}
            />
            No reparado
          </label>
        </div>
      </fieldset>
      {withParts && <PartsPicker used={used} onChange={setUsed} />}

      {result === "not_repaired" && (
        <>
          <label className={styles.label} htmlFor="finish-reason">
            Por qué no se repara
          </label>
          <input
            id="finish-reason"
            className={styles.input}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
          />
        </>
      )}

      <p className={styles.actions}>
        <Button type="submit" variant="primary" loading={saving} disabledReason={missing}>
          Finalizar orden
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
      </p>
    </form>
  );
}

