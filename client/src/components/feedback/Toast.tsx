"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Toast.module.css";

/** How long a toast stays, unless the pointer or the focus is on it. */
export const TOAST_MS = 5000;

interface Props {
  text: string;
  /** Shows «Deshacer». */
  undo?: () => void;
  error?: boolean;
  /** Called when the time runs out. */
  onDone: () => void;
}

/**
 * Design 4 «Toast con Deshacer»: rises in, lasts 5 s with a bar that shows the
 * time left, and waits while the pointer or the keyboard focus is on it.
 * Render it with a new `key` for each message so the time starts again.
 */
export function Toast({ text, undo, error, onDone }: Props) {
  const [paused, setPaused] = useState(false);
  const left = useRef(TOAST_MS);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => onDoneRef.current(), left.current);
    return () => {
      window.clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [paused]);

  return (
    <div
      role="status"
      className={`${styles.toast} ${error ? styles.error : ""}`}
      data-paused={paused || undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.text}>{text}</span>
      {undo && (
        <button type="button" className={styles.undo} onClick={undo}>
          Deshacer
        </button>
      )}
      <span className={styles.bar} style={{ animationDuration: `${TOAST_MS}ms` }} aria-hidden />
    </div>
  );
}
