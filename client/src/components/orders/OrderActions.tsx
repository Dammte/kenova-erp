"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Check, PackageCheck, PackageOpen, PhoneIncoming } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { DeliverForm } from "./DeliverForm";
import { CancelForm } from "./CancelForm";
import type { OrderDetail, OrderPayment } from "./orderDetail";
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
export function finishPayload(workDone: string, tests: Test[], result: Result, reason: string) {
  return {
    status: "finalizado" as const,
    workDone: workDone.trim(),
    testsDone: TESTS.map(([t]) => t).filter((t) => tests.includes(t)),
    result,
    notRepairedReason: result === "not_repaired" ? reason.trim() : null,
  };
}

/**
 * Design 1.5: the one next step for the order's status, at the top of the
 * panel. Other moves stay in the list's status menu.
 */
export function OrderActions({
  order,
  payments,
  onChanged,
}: {
  order: OrderDetail;
  payments: OrderPayment[];
  onChanged: () => void;
}) {
  const [step, setStep] = useState<"idle" | "finish" | "deliver" | "cancel">("idle");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const patch = async (body: object): Promise<boolean> => {
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar el cambio."));
        return false;
      }
      onChanged();
      return true;
    } catch {
      setProblem("No se ha podido guardar el cambio. Comprueba la conexión.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resume = (label: string, icon: ReactNode, hint: string) => (
    <>
      <p className={styles.hint}>{hint}</p>
      <Button variant="primary" icon={icon} loading={saving} onClick={() => patch({ status: "en_progreso" })}>
        {label}
      </Button>
    </>
  );

  let body: ReactNode;
  const { status } = order;
  if (status === "pendiente_cliente") {
    body = resume("Cliente respondió", <PhoneIncoming size={16} aria-hidden />, "La orden vuelve a «En progreso».");
  } else if (status === "pendiente_piezas") {
    body = resume("Pieza recibida", <PackageCheck size={16} aria-hidden />, "La orden vuelve a «En progreso».");
  } else if (status === "en_progreso") {
    body =
      step === "finish" ? (
        <FinishForm
          initialWork={order.workDone ?? ""}
          saving={saving}
          onCancel={() => setStep("idle")}
          onSubmit={(payload) => patch(payload)}
        />
      ) : (
        <Button variant="primary" icon={<Check size={16} aria-hidden />} onClick={() => setStep("finish")}>
          Finalizar…
        </Button>
      );
  } else if (status === "finalizado") {
    body =
      step === "deliver" ? (
        <DeliverForm order={order} onCancel={() => setStep("idle")} onDone={onChanged} />
      ) : (
        <Button variant="primary" icon={<PackageOpen size={16} aria-hidden />} onClick={() => setStep("deliver")}>
          Entregar…
        </Button>
      );
  } else {
    return null;
  }
  if (step === "cancel") {
    body = <CancelForm order={order} payments={payments} onCancel={() => setStep("idle")} onDone={onChanged} />;
  } else if (step === "idle") {
    // A delivered order is not cancelled: its money goes back with a refund.
    body = (
      <>
        {body}
        <p className={styles.secondary}>
          <Button variant="ghost" size="sm" onClick={() => setStep("cancel")}>
            Cancelar orden…
          </Button>
        </p>
      </>
    );
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Siguiente paso</h3>
      {body}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

function FinishForm({
  initialWork,
  saving,
  onCancel,
  onSubmit,
}: {
  initialWork: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: ReturnType<typeof finishPayload>) => void;
}) {
  const [work, setWork] = useState(initialWork);
  const [tests, setTests] = useState<Test[]>([]);
  const [result, setResult] = useState<Result>("repaired");
  const [reason, setReason] = useState("");

  const missing = !work.trim()
    ? "Escribe el trabajo realizado."
    : result === "not_repaired" && !reason.trim()
      ? "Indica por qué no se repara."
      : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!missing) onSubmit(finishPayload(work, tests, result, reason));
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
