"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellRing, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { whatsappLink } from "@/components/quotes/quotes";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { renderTemplate, type MessageTemplate, type TemplateValues } from "./notices";
import styles from "./PickupReminders.module.css";

/** GET /api/notices/reminders. */
export interface PickupReminder {
  id: string;
  code: string;
  storeId: string;
  storeName: string;
  firstName: string;
  clientName: string;
  phone: string | null;
  model: string | null;
  totalPrice: string;
  balance: string;
  days: number;
  trigger: "reminder_15" | "reminder_30";
}

export const reminderValues = (r: PickupReminder): TemplateValues => ({
  nombre: r.firstName,
  modelo: r.model ?? "dispositivo",
  orden: r.code,
  total: formatEur(r.totalPrice),
  saldo: formatEur(r.balance),
  tienda: r.storeName,
});

/** Each store's texts, fetched once per store in the queue. */
async function loadTemplates(storeIds: string[]): Promise<Record<string, MessageTemplate[]>> {
  const entries = await Promise.all(
    storeIds.map(async (id) => {
      const res = await apiFetch(`${API_URL}/message-templates?storeId=${id}`);
      return [id, res.ok ? ((await res.json()) as MessageTemplate[]) : []] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Design 2.5: the devices finished 15 or 30 days ago and still not collected.
 * Each «Enviar» opens WhatsApp with the store's reminder and notes it on the
 * order, so the row leaves the queue. Nothing shows when nothing is due.
 */
export function PickupReminders() {
  const [rows, setRows] = useState<PickupReminder[] | null>(null);
  const [templates, setTemplates] = useState<Record<string, MessageTemplate[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let live = true;
    apiFetch(`${API_URL}/notices/reminders`)
      .then(async (res) => (res.ok ? ((await res.json()) as PickupReminder[]) : []))
      .then(async (found) => {
        if (!live) return;
        setRows(found);
        const stores = [...new Set(found.map((r) => r.storeId))];
        if (stores.length) {
          const loaded = await loadTemplates(stores);
          if (live) setTemplates(loaded);
        }
      })
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);

  if (!rows || rows.length === 0) return message ? <p role="status" className={styles.done}>{message}</p> : null;

  const textFor = (r: PickupReminder) => {
    const t = templates[r.storeId]?.find((x) => x.trigger === r.trigger);
    return t ? renderTemplate(t.body, reminderValues(r)) : null;
  };

  const send = async (r: PickupReminder) => {
    const text = textFor(r);
    const link = r.phone && text ? whatsappLink(r.phone, text) : null;
    if (!link || !text) return;
    window.open(link, "_blank", "noopener");
    setBusy(r.id);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${r.id}/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: r.trigger, body: text }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, `El recordatorio de ${r.code} no ha quedado apuntado.`));
        return;
      }
      setMessage(`Recordatorio de ${r.code} apuntado en la orden.`);
      setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
      // Straight on to the next one.
      requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus());
    } catch {
      setProblem(`El recordatorio de ${r.code} no ha quedado apuntado: se ha perdido la conexión.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="pickup-reminders">
      <h2 id="pickup-reminders" className={styles.title}>
        <BellRing size={16} aria-hidden />
        Recordatorios de recogida
        <span className={styles.count}>{rows.length}</span>
      </h2>
      {message && (
        <p role="status" className={styles.done}>
          {message}
        </p>
      )}
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      <ul className={styles.list} ref={list}>
        {rows.map((r) => (
          <li key={r.id} className={styles.row}>
            <div className={styles.who}>
              <p>
                <Link href={`/ordenes?orden=${r.id}`} className={styles.code}>
                  {r.code}
                </Link>{" "}
                · {r.clientName}
              </p>
              <p className={r.trigger === "reminder_30" ? styles.late : styles.muted}>
                {r.days} días sin recoger{r.model ? ` · ${r.model}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              icon={<MessageCircle size={14} aria-hidden />}
              loading={busy === r.id}
              disabledReason={
                !r.phone
                  ? "Sin teléfono: llamar"
                  : !textFor(r)
                    ? "Cargando texto"
                    : !whatsappLink(r.phone, "x")
                      ? "Teléfono no válido"
                      : undefined
              }
              onClick={() => send(r)}
              aria-label={`Enviar recordatorio a ${r.clientName}`}
            >
              Enviar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
