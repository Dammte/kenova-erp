"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { FinishForm, type finishPayload } from "./FinishForm";
import type { OrderRow } from "./orderList";
import styles from "./OrderList.module.css";

type Step = { kind: "loading" } | { kind: "form"; work: string } | { kind: "failed" } | { kind: "done" };

/**
 * Design R3 3.2: «Finalizar» straight from the list, without opening the
 * order. Asks for the work done, the tests, the result and, for the partners,
 * the parts used, which come out of stock in the same step.
 */
export function FinishDialog({
  row,
  onClose,
  onFinished,
  onOpen,
}: {
  row: Pick<OrderRow, "id" | "code" | "clientName" | "device">;
  onClose: () => void;
  /** The order is finished: the list reloads. */
  onFinished: () => void;
  /** Opens the order's panel, to notify the client or print. */
  onOpen: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The work done may already be written (an order finished, then reopened).
  useEffect(() => {
    let live = true;
    setStep({ kind: "loading" });
    apiFetch(`${API_URL}/service-orders/${row.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const order = (await res.json()) as { workDone: string | null };
        if (live) setStep({ kind: "form", work: order.workDone ?? "" });
      })
      .catch(() => live && setStep({ kind: "failed" }));
    return () => {
      live = false;
    };
  }, [row.id, attempt]);

  const finish = async (payload: ReturnType<typeof finishPayload>) => {
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido finalizar la orden."));
        return;
      }
      setStep({ kind: "done" });
      onFinished();
    } catch {
      setProblem("No se ha podido finalizar la orden. Comprueba la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
    // Ctrl+Intro confirms, as in every dialog of the design.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      dialogRef.current?.querySelector("form")?.requestSubmit();
    }
  };

  const title = step.kind === "done" ? `${row.code} finalizada` : `Finalizar ${row.code}`;
  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        onKeyDown={onKey}
      >
        <header className={styles.dialogHead}>
          <div>
            <h2 id="finish-title" className={styles.dialogTitle}>
              {step.kind === "done" && <CheckCircle2 size={20} aria-hidden className={styles.okIcon} />}
              {title}
            </h2>
            <p className={styles.dialogSub}>
              {row.clientName}
              {row.device ? ` · ${row.device}` : ""}
            </p>
          </div>
          <button type="button" className={styles.dialogClose} aria-label="Cerrar" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>

        {step.kind === "loading" && <p className={styles.dialogSub}>Cargando la orden…</p>}
        {step.kind === "failed" && (
          <p className={styles.dialogError} role="alert">
            No se ha podido abrir la orden.{" "}
            <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
          </p>
        )}
        {step.kind === "form" && (
          <FinishForm
            initialWork={step.work}
            saving={saving}
            withParts={user?.role === "SUPER_ADMIN"}
            onCancel={onClose}
            onSubmit={(payload) => void finish(payload)}
          />
        )}
        {step.kind === "done" && (
          <>
            <p>Ya sale como «Finalizado». Desde la orden puedes avisar al cliente o imprimir.</p>
            <p className={styles.dialogActions}>
              <Button variant="primary" autoFocus onClick={onOpen}>
                Abrir la orden
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
            </p>
          </>
        )}
        {problem && (
          <p className={styles.dialogError} role="alert">
            {problem}
          </p>
        )}
      </div>
    </>,
    document.body,
  );
}
