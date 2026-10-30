import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./Field.module.css";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "prefix"> {
  /** Always visible above the field. */
  label: string;
  /** Help shown under the field while there is no error. */
  hint?: string;
  /** Said plainly under the field, e.g. "Faltan cifras: un teléfono tiene 9". */
  error?: string;
  /** Fixed text before the value, such as "+34" or "€". */
  prefix?: ReactNode;
}

/** Design system 3.5: label on top, plain-language error below. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, hint, error, prefix, className, required, ...rest },
    ref,
  ) {
    const id = useId();
    const noteId = `${id}-note`;
    const note = error ?? hint;
    return (
      <div className={[styles.field, className].filter(Boolean).join(" ")}>
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden>
              {" "}
              *
            </span>
          )}
        </label>
        <div className={styles.control} data-invalid={error ? "" : undefined}>
          {prefix && <span className={styles.prefix}>{prefix}</span>}
          <input
            ref={ref}
            id={id}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={note ? noteId : undefined}
            className={styles.input}
            {...rest}
          />
        </div>
        {note && (
          <p id={noteId} className={error ? styles.error : styles.hint}>
            {note}
          </p>
        )}
      </div>
    );
  },
);
