"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatDateTime, type OrderNote } from "./orderDetail";
import styles from "./OrderPanel.module.css";

/** Important notes first, then the newest. */
export const sortNotes = (notes: OrderNote[]): OrderNote[] =>
  [...notes].sort(
    (a, b) =>
      Number(b.type !== "normal") - Number(a.type !== "normal") ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

/**
 * Design 1.5: internal notes, never printed. A note is saved as soon as it is
 * added, like a message, with no separate "Guardar".
 */
export function OrderNotes({ orderId, initial }: { orderId: string; initial: OrderNote[] }) {
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [important, setImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${orderId}/sticky-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, type: important ? "important" : "normal" }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar la nota."));
        return;
      }
      const note = (await res.json()) as OrderNote;
      setNotes((n) => [note, ...n]);
      setText("");
      setImportant(false);
    } catch {
      setProblem("No se ha podido guardar la nota. Comprueba la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className={styles.hint}>No salen en impresos.</p>
      {notes.length === 0 ? (
        <p className={styles.muted}>Sin notas.</p>
      ) : (
        <ul className={styles.notes}>
          {sortNotes(notes).map((n) => (
            <li key={n.id} className={n.type !== "normal" ? styles[n.type] : undefined}>
              <p>{n.content}</p>
              <p className={styles.muted}>
                {[n.createdBy?.fullName, formatDateTime(n.createdAt), n.type !== "normal" && "importante"]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.noteForm} onSubmit={add}>
        <label className={styles.srOnly} htmlFor={`note-${orderId}`}>
          Nueva nota interna
        </label>
        <textarea
          id={`note-${orderId}`}
          className={styles.textarea}
          value={text}
          maxLength={2000}
          rows={2}
          placeholder="Escribe una nota para el taller"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl+Enter adds the note without leaving the keyboard.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void add(e);
          }}
        />
        <div className={styles.noteActions}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={important}
              onChange={(e) => setImportant(e.target.checked)}
            />
            Importante (va arriba)
          </label>
          <Button
            type="submit"
            size="sm"
            loading={saving}
            loadingText="Guardando…"
            disabledReason={text.trim() ? undefined : "Escribe la nota primero"}
          >
            Añadir
          </Button>
        </div>
        {problem && (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}
      </form>
    </>
  );
}
