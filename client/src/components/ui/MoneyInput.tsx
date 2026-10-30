import { useEffect, useState } from "react";
import { formatEur } from "@/lib/format";
import { formatMoneyInput, parseMoney } from "@/lib/money";
import { TextField, type TextFieldProps } from "./TextField";

export interface MoneyInputProps
  extends Omit<TextFieldProps, "value" | "onChange" | "prefix" | "type"> {
  /** The amount in euros, or null while empty or invalid. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Highest amount allowed, such as the order's pending balance. */
  max?: number;
}

/**
 * Design system 3.5: accepts "12,5" or "12.5" and shows "12,50" when the field
 * loses focus. An amount above `max` is refused, so a charge can never leave
 * the balance below 0,00 €.
 */
export function MoneyInput({
  value,
  onChange,
  max,
  error,
  onBlur,
  ...rest
}: MoneyInputProps) {
  const [text, setText] = useState(value === null ? "" : formatMoneyInput(value));
  const [problem, setProblem] = useState<string>();

  // Follow changes made from outside, such as "pay the whole balance".
  useEffect(() => {
    if (value !== parseMoney(text)) {
      setText(value === null ? "" : formatMoneyInput(value));
      setProblem(undefined);
    }
    // Only an outside change of value should rewrite what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const read = (next: string) => {
    setText(next);
    if (!next.trim()) {
      setProblem(undefined);
      onChange(null);
      return;
    }
    const amount = parseMoney(next);
    if (amount === null) {
      setProblem("Escribe un importe, por ejemplo 12,50.");
      onChange(null);
    } else if (max !== undefined && amount > max) {
      setProblem(`No puede pasar de ${formatEur(max)}.`);
      onChange(null);
    } else {
      setProblem(undefined);
      onChange(amount);
    }
  };

  return (
    <TextField
      {...rest}
      inputMode="decimal"
      autoComplete="off"
      prefix="€"
      value={text}
      error={error ?? problem}
      onChange={(e) => read(e.target.value)}
      onBlur={(e) => {
        const amount = parseMoney(text);
        if (amount !== null && !problem) setText(formatMoneyInput(amount));
        onBlur?.(e);
      }}
    />
  );
}
