"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { DOC_LABEL, formatDay, fullName, type ClientData, type DuplicateOf } from "./clients";
import styles from "./Clients.module.css";

type Field = "firstName" | "lastName" | "phoneNumber" | "dni" | "email" | "address" | "postalCode" | "city";
const FIELDS: { key: Field; label: string }[] = [
  { key: "firstName", label: "Nombre" },
  { key: "lastName", label: "Apellidos" },
  { key: "phoneNumber", label: "Teléfono" },
  { key: "dni", label: "Documento" },
  { key: "email", label: "Email" },
  { key: "address", label: "Dirección" },
  { key: "postalCode", label: "Código postal" },
  { key: "city", label: "Ciudad" },
];
type Side = "keep" | "from";
type Person = Pick<ClientData, Field | "dniType">;

/** A field as shown: the document carries its type. */
const shown = (c: Person, f: Field): string => {
  const v = (c[f] ?? "").trim();
  if (f === "dni" && v) return `${DOC_LABEL[c.dniType] ?? c.dniType} ${v}`;
  return v;
};

/**
 * The value each field starts with: the one that is filled in, or the
 * longer one when both are (more complete), the kept client's on a tie.
 */
export function preselect(keep: Person, from: Person): Record<Field, Side> {
  return Object.fromEntries(
    FIELDS.map(({ key }) => {
      const a = shown(keep, key);
      const b = shown(from, key);
      return [key, b.length > a.length ? "from" : "keep"];
    }),
  ) as Record<Field, Side>;
}

/** The fields to send: only those taken from the duplicate that change the kept client. */
export function mergeData(keep: Person, from: Person, pick: Record<Field, Side>): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const { key } of FIELDS) {
    if (pick[key] !== "from" || shown(keep, key) === shown(from, key)) continue;
    if (key === "dni") {
      data.dniType = from.dniType;
      data.dni = from.dni?.trim() || null;
    } else {
      data[key] = from[key]?.trim() || null;
    }
  }
  return data;
}

/**
 * «Revisar y fusionar» (partners only): the duplicate's orders, devices and
 * quotes move to the open client, field by field the partner picks which
 * value stays, and the duplicate is archived pointing to it.
 */
export function MergeDialog({
  keep,
  from,
  onClose,
  onMerged,
}: {
  keep: ClientData;
  from: DuplicateOf;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [pick, setPick] = useState(() => preselect(keep, from));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const merge = async () => {
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/clients/${keep.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: from.id, data: mergeData(keep, from, pick) }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se han podido fusionar las fichas."));
        return;
      }
      onMerged();
    } catch {
      setProblem("No se han podido fusionar: se ha perdido la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const keepName = fullName(keep);
  const fromName = fullName(from);
  // On the body, so no stacking context of the page leaves the bars on top.
  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="merge-title">
        <header className={styles.cardHead}>
          <div className={styles.cardTitle}>
            <h2 id="merge-title">Revisar y fusionar</h2>
            <p className={styles.muted}>Elige qué dato se queda en cada fila. Se preselecciona el más completo.</p>
          </div>
          <button ref={closeRef} type="button" className={styles.close} aria-label="Cerrar" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>

        <table className={styles.mergeTable}>
          <thead>
            <tr>
              <th />
              <th>
                {keepName} <span className={styles.muted}>· se queda</span>
              </th>
              <th>
                {fromName}{" "}
                <span className={styles.muted}>
                  · {from.orders} {from.orders === 1 ? "orden" : "órdenes"}
                  {from.firstVisit ? ` desde ${formatDay(from.firstVisit)}` : ""}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(({ key, label }) => {
              const a = shown(keep, key);
              const b = shown(from, key);
              const same = a === b;
              return (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  {same ? (
                    <td colSpan={2} className={styles.muted}>
                      {a || "—"} {a && "(igual en las dos)"}
                    </td>
                  ) : (
                    (["keep", "from"] as const).map((side) => (
                      <td key={side}>
                        <label className={styles.choice}>
                          <input
                            type="radio"
                            name={`merge-${key}`}
                            aria-label={`${label}: ${(side === "keep" ? a : b) || "vacío"}`}
                            checked={pick[key] === side}
                            onChange={() => setPick({ ...pick, [key]: side })}
                          />
                          {(side === "keep" ? a : b) || <span className={styles.muted}>vacío</span>}
                        </label>
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className={styles.notice}>
          Las órdenes, dispositivos y presupuestos de «{fromName}» pasan a «{keepName}». La ficha de «{fromName}» deja de
          aparecer; no se pierde ninguna orden.
        </p>
        {problem && (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        )}
        <div className={styles.saveBar}>
          <Button variant="primary" loading={saving} onClick={merge}>
            Fusionar
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
