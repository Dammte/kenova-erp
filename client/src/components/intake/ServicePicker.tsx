"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { formatEur } from "@/lib/format";
import { METHODS } from "@/components/orders/ChargeForm";
import { QUICK_SERVICES, newLine, orderTotal, type IntakeLine, type IntakeState } from "./intake";
import styles from "./Intake.module.css";

type Money = Pick<IntakeState, "lines" | "deposit" | "method">;

/** Puts the cursor in a line's amount once it is on screen. */
const focusPrice = (line: IntakeLine) =>
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[name="${line.key}-price"]`)?.focus());

/**
 * Block "Servicios y precio": what will be done, written as it is said, with
 * its amount. The usual jobs are one tap away. The total is the lines' sum.
 */
export function ServicePicker({ value, onChange }: { value: Money; onChange: (patch: Partial<Money>) => void }) {
  const lines = value.lines;
  const change = (key: string, patch: Partial<IntakeLine>) =>
    onChange({ lines: lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });

  /** A quick job fills the empty line there is, or adds one. */
  const quick = (name: string) => {
    const same = lines.find((l) => l.description.trim() === name);
    if (same) {
      onChange({ lines: lines.filter((l) => l.key !== same.key) });
      return;
    }
    const empty = lines.find((l) => !l.description.trim() && l.price === null);
    const line = empty ? { ...empty, description: name } : newLine(name);
    onChange({ lines: empty ? lines.map((l) => (l.key === empty.key ? line : l)) : [...lines, line] });
    focusPrice(line);
  };

  const total = orderTotal(value);
  const pending = Math.max(0, total - (value.deposit ?? 0));

  return (
    <>
      <div className={styles.chips} role="group" aria-label="Servicios habituales">
        {QUICK_SERVICES.map((name) => (
          <button
            key={name}
            type="button"
            className={styles.chip}
            aria-pressed={lines.some((l) => l.description.trim() === name)}
            onClick={() => quick(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {lines.length === 0 ? (
        <p className={styles.muted}>
          Sin servicios todavía. Puedes crear la orden solo con la avería y presupuestar después.
        </p>
      ) : (
        lines.map((l, i) => (
          <div key={l.key} className={styles.lineRow}>
            <TextField
              name={`${l.key}-description`}
              label={`Servicio ${i + 1}`}
              placeholder="Qué se va a hacer"
              maxLength={150}
              value={l.description}
              onChange={(e) => change(l.key, { description: e.target.value })}
            />
            <MoneyInput
              name={`${l.key}-price`}
              label={`Importe ${i + 1}`}
              value={l.price}
              onChange={(price) => change(l.key, { price })}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Quitar ${l.description.trim() || `servicio ${i + 1}`}`}
              icon={<Trash2 size={16} aria-hidden />}
              onClick={() => onChange({ lines: lines.filter((x) => x.key !== l.key) })}
            />
          </div>
        ))
      )}
      <p>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus size={16} aria-hidden />}
          onClick={() => {
            const line = newLine();
            onChange({ lines: [...lines, line] });
            requestAnimationFrame(() =>
              document.querySelector<HTMLInputElement>(`[name="${line.key}-description"]`)?.focus(),
            );
          }}
        >
          Añadir servicio
        </Button>
      </p>

      <MoneyInput
        name="deposit"
        label="A cuenta · opcional"
        error={value.deposit && value.deposit > total ? `A cuenta no puede superar el total (${formatEur(total)}).` : undefined}
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

      <p className={styles.totals}>
        <span>
          Total <strong>{formatEur(total)}</strong>
        </span>
        <span>
          A cuenta <strong>{formatEur(Math.min(value.deposit ?? 0, total))}</strong>
        </span>
        <span>
          Pendiente <strong>{formatEur(pending)}</strong>
        </span>
      </p>
    </>
  );
}
