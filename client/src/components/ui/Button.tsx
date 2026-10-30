import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  variant?: ButtonVariant;
  /** sm is for desktop only; md grows to 44 px on touch screens. */
  size?: ButtonSize;
  /** Icon shown before the text. */
  icon?: ReactNode;
  /** While true the button is disabled and shows a spinner and `loadingText`. */
  loading?: boolean;
  loadingText?: string;
  /**
   * Why the button cannot be used. A disabled button always says why, so this
   * is the only way to disable it.
   */
  disabledReason?: string;
}

/** Design system 3.4. Only one primary button per screen. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      icon,
      loading = false,
      loadingText,
      disabledReason,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    const reasonId = useId();
    const disabled = loading || Boolean(disabledReason);
    const button = (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        aria-busy={loading || undefined}
        aria-describedby={disabledReason ? reasonId : undefined}
        className={[styles.button, styles[variant], styles[size], className]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {loading ? (
          <Loader2 className={styles.spinner} aria-hidden size={16} />
        ) : (
          icon
        )}
        {loading && loadingText ? loadingText : children}
      </button>
    );
    if (!disabledReason) return button;
    return (
      <span className={styles.wrap}>
        {button}
        <span id={reasonId} className={styles.reason}>
          {disabledReason}
        </span>
      </span>
    );
  },
);
