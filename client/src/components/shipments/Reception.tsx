"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import type { ScanResult, Shipment } from "./shipments";
import styles from "./Shipments.module.css";

interface Props {
  shipment: Shipment;
  /** The reception is over: the shipment as the server left it. */
  onClosed: () => void;
  onCancel: () => void;
}

type Tone = "ok" | "warn" | "muted" | "error";
interface Reading {
  seq: number;
  tone: Tone;
  message: string;
}

const TONE: Record<ScanResult["result"], Tone> = {
  received: "ok",
  late: "ok",
  already: "muted",
  foreign: "warn",
  unknown: "warn",
};

/** A short beep: high when a device is confirmed, low when something is off. */
function beep(tone: Tone) {
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    osc.frequency.value = tone === "ok" ? 880 : 220;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    // No sound is fine: the colour and the text say the same.
  }
}

/**
 * Design R2 3.14 «Recepción con lector»: the scanner types the code and Enter,
 * each reading confirms a device. A code not in the shipment warns and goes on.
 */
export function Reception({ shipment, onClosed, onCancel }: Props) {
  const lines = shipment.lines ?? [];
  const [received, setReceived] = useState<Set<string>>(
    () => new Set(lines.filter((l) => l.receivedAt).map((l) => l.orderCode)),
  );
  const [code, setCode] = useState("");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Readings go to the server one after the other, in the order they were read.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const seq = useRef(0);

  useEffect(() => input.current?.focus(), []);

  const note = (tone: Tone, message: string) => {
    seq.current += 1;
    const reading = { seq: seq.current, tone, message };
    setReadings((prev) => [reading, ...prev].slice(0, 8));
    beep(tone);
  };

  const send = (raw: string) => {
    const value = raw.trim().toUpperCase();
    queue.current = queue.current.then(async () => {
      try {
        const res = await apiFetch(`${API_URL}/shipments/${shipment.id}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: value }),
        });
        if (!res.ok) {
          note(
            "error",
            await errorMessage(
              res,
              `No se ha podido guardar la lectura de ${value}. Vuelve a escanearla.`,
            ),
          );
          return;
        }
        const r = (await res.json()) as ScanResult;
        if (
          (r.result === "received" || r.result === "already") &&
          r.orderCode
        ) {
          const done = r.orderCode;
          setReceived((prev) => new Set(prev).add(done));
        }
        note(TONE[r.result], r.message);
      } catch {
        note(
          "error",
          `No se ha podido guardar la lectura de ${value}. Vuelve a escanearla.`,
        );
      }
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    send(code);
    setCode("");
    setConfirm(false);
  };

  const pending = lines.filter(
    (l) => !received.has(l.orderCode) && !l.notArrived,
  );

  const close = async () => {
    setClosing(true);
    setProblem(null);
    await queue.current;
    try {
      const res = await apiFetch(`${API_URL}/shipments/${shipment.id}/close`, {
        method: "POST",
      });
      if (!res.ok) {
        setProblem(
          await errorMessage(res, "No se ha podido terminar la recepción."),
        );
        return;
      }
      onClosed();
    } catch {
      setProblem(
        "No se ha podido terminar la recepción. Comprueba la conexión.",
      );
    } finally {
      setClosing(false);
    }
  };

  return (
    <section
      className={styles.reception}
      aria-label={`Recibir ${shipment.code}`}
    >
      <div className={styles.receptionHead}>
        <h3 className={styles.receptionTitle}>
          Recibir {shipment.code} · {received.size} de {lines.length}
        </h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Salir
        </Button>
      </div>

      <form onSubmit={submit} className={styles.scanForm}>
        <label htmlFor="scan" className={styles.srOnly}>
          Código de la etiqueta
        </label>
        <input
          id="scan"
          ref={input}
          className={styles.scanInput}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Escanea la etiqueta…"
          autoComplete="off"
          spellCheck={false}
        />
      </form>

      <ul className={styles.readings} aria-live="polite">
        {readings.map((r) => (
          <li key={r.seq} className={styles[`reading_${r.tone}`]}>
            {r.message}
          </li>
        ))}
      </ul>

      <ul className={styles.checklist}>
        {lines.map((l) => {
          const done = received.has(l.orderCode);
          return (
            <li key={l.orderId} className={done ? styles.checkDone : undefined}>
              <span aria-hidden>{done ? "✓" : "·"}</span> {l.orderCode}
              {l.device && ` · ${l.device}`}
              <span className={styles.checkState}>
                {done ? "Recibido" : l.notArrived ? "No llegó" : "Pendiente"}
              </span>
            </li>
          );
        })}
      </ul>

      {confirm && pending.length > 0 ? (
        <div
          className={styles.confirm}
          role="alertdialog"
          aria-label="Terminar la recepción"
        >
          <p>
            <strong>Falta {pending.map((l) => l.orderCode).join(", ")}.</strong>{" "}
            Si lo marcas como no llegado, el envío queda «Recibido incompleto» y
            el equipo se confirma cuando llegue en otro envío.
          </p>
          <div className={styles.actions}>
            <Button
              variant="danger"
              size="sm"
              loading={closing}
              onClick={close}
            >
              Marcar como no llegado
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setConfirm(false);
                input.current?.focus();
              }}
            >
              Seguir esperando
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            loading={closing}
            onClick={() =>
              pending.length > 0 ? setConfirm(true) : void close()
            }
          >
            Terminar recepción
          </Button>
        </div>
      )}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
