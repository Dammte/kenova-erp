"use client";

import type { KeyboardEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { formatEur } from "@/lib/format";
import { METHODS } from "@/components/orders/ChargeForm";
import { EMPTY_DRAFT, QUICK_SERVICES, draftReady, newLine, orderTotal, type IntakeState } from "./intake";
import styles from "./Intake.module.css";

type Money = Pick<IntakeState, "lines" | "draft" | "deposit" | "method">;

const focus = (name: string) =>
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[name="${name}"]`)?.focus());

/**
 * Block "Servicios y precio": one row to write a service and its amount,
 * «Añadir» puts it on the list below, where a mistake is removed with one
 * tap. Suggestions only write the text. The total is the list's sum.
 */
export function ServicePicker({
  value,
  suggested = [],
  onChange,
}: {
  value: Money;
  /** Jobs the declared symptoms point to: shown first and marked. */
  suggested?: string[];
  onChange: (patch: Partial<Money>) => void;
}) {
  const { lines, draft } = value;
  const ready = draftReady(draft);

  const add = () => {
    if (!ready) return;
    onChange({ lines: [...lines, newLine(draft.description, draft.price!)], draft: EMPTY_DRAFT });
    focus("service-entry");
  };
  // Enter adds the service instead of sending the whole form.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      add();
    }
  };
  const suggest = (name: string) => {
    onChange({ draft: { ...draft, description: name } });
    focus("service-price");
  };

  const total = orderTotal(value);

  return (
    <>
      <div className={styles.entryRow} onKeyDown={onKey}>
        <TextField
          name="service-entry"
          label="Servicio"
          placeholder="Qué se va a hacer"
          maxLength={150}
          value={draft.description}
          onChange={(e) => onChange({ draft: { ...draft, description: e.target.value } })}
        />
        <MoneyInput
          name="service-price"
          label="Importe"
          value={draft.price}
          onChange={(price) => onChange({ draft: { ...draft, price } })}
        />
        <Button
          variant="secondary"
          icon={<Plus size={16} aria-hidden />}
          disabledReason={
            ready ? undefined : draft.description.trim() ? "Escribe el importe" : "Escribe qué se va a hacer"
          }
          onClick={add}
        >
          Añadir
        </Button>
      </div>

      <div className={styles.group}>
        <span className={styles.muted} id="service-suggestions">
          Sugerencias
        </span>
        <div className={styles.chips} role="group" aria-labelledby="service-suggestions">
          {[...suggested, ...QUICK_SERVICES.filter((n) => !suggested.includes(n))].map((name) => (
            <button
              key={name}
              type="button"
              className={`${styles.chip} ${suggested.includes(name) ? styles.suggested : ""}`}
              title={suggested.includes(name) ? "Sugerido por la avería" : undefined}
              onClick={() => suggest(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {lines.length > 0 ? (
        <ul className={styles.lines} aria-label="Servicios añadidos">
          {lines.map((l) => (
            <li key={l.key}>
              <span>{l.description}</span>
              <span className={styles.lineEnd}>
                {formatEur(l.price)}
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Quitar ${l.description}`}
                  onClick={() => onChange({ lines: lines.filter((x) => x.key !== l.key) })}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>
          Sin servicios todavía. Puedes crear la orden solo con la avería y presupuestar después.
        </p>
      )}

      <MoneyInput
        name="deposit"
        label="Anticipo · opcional"
        hint="Lo que el cliente paga ahora, al dejar el equipo."
        error={value.deposit && value.deposit > total ? `El anticipo no puede superar el total (${formatEur(total)}).` : undefined}
        value={value.deposit}
        onChange={(v) => onChange({ deposit: v || null, ...(v ? {} : { method: null }) })}
      />

      {Boolean(value.deposit) && (
        <fieldset className={styles.group} data-field="method">
          <legend className={styles.label}>Forma de pago</legend>
          <div className={styles.chips}>
            {METHODS.map(([m, text]) => (
              <label key={m} className={styles.chip}>
                <input type="radio" name="deposit-method" checked={value.method === m} onChange={() => onChange({ method: m })} />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}
