"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { whatsappLink } from "@/components/quotes/quotes";
import {
  renderTemplate,
  suggestedTrigger,
  type MessageTemplate,
  type TemplateTrigger,
  type TemplateValues,
} from "@/components/notices/notices";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { shopDays, type OrderDetail } from "./orderDetail";
import styles from "./OrderPanel.module.css";

/** The order's store templates and the store's name, for {tienda}. */
function useTemplates(storeId: string | undefined) {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const qs = storeId ? `?storeId=${storeId}` : "";
    apiFetch(`${API_URL}/message-templates${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) setTemplates((await res.json()) as MessageTemplate[]);
      })
      .catch(() => live && setFailed(true));
    if (storeId) {
      apiFetch(`${API_URL}/stores/${storeId}`)
        .then(async (res) => (res.ok ? ((await res.json()) as { name?: string }) : null))
        .then((s) => live && s?.name && setStoreName(s.name))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [storeId]);
  return { templates, storeName, failed };
}

export function orderValues(order: OrderDetail, tienda: string): TemplateValues {
  return {
    nombre: order.client.firstName,
    modelo: order.device?.model ?? "dispositivo",
    orden: order.code,
    total: formatEur(order.totalPrice),
    saldo: formatEur(order.balance),
    tienda,
  };
}

/**
 * Design 2.5: pick a notice (the one that fits the status comes chosen), check
 * the text with the order's data, open WhatsApp with it and keep it on the order.
 */
export function NoticeForm({
  order,
  phone,
  onDone,
  onCancel,
}: {
  order: OrderDetail;
  phone: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { templates, storeName, failed } = useTemplates(order.storeId);
  const suggested = suggestedTrigger(order.status, shopDays(order));
  const [trigger, setTrigger] = useState<TemplateTrigger>(suggested);
  const [text, setText] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const template = templates?.find((t) => t.trigger === trigger);
  const values = orderValues(order, storeName ?? "Kenova");
  const body = text ?? (template ? renderTemplate(template.body, values) : "");
  const link = whatsappLink(phone, body);

  const choose = (t: TemplateTrigger) => {
    setTrigger(t);
    setText(null);
    setOpened(false);
  };

  const send = async () => {
    if (!link || !template || saving) return;
    // Opened inside the click, or the browser blocks the new tab.
    if (!opened) window.open(link, "_blank", "noopener");
    setOpened(true);
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${order.id}/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger, body }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "El aviso no ha quedado apuntado en la orden."));
        return;
      }
      onDone(`Aviso «${template.name}» apuntado en el historial.`);
    } catch {
      setProblem("WhatsApp se ha abierto, pero el aviso no ha quedado apuntado: se ha perdido la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };

  const missing = !template
    ? "Cargando plantillas"
    : !body.trim()
      ? "Escribe el texto"
      : !link
        ? "El teléfono no es válido para WhatsApp"
        : undefined;

  return (
    <div className={styles.finish} role="group" aria-label="Enviar aviso" onKeyDown={onKey}>
      {failed && (
        <p className={styles.error} role="alert">
          No se han podido cargar las plantillas.
        </p>
      )}
      {templates && (
        <fieldset className={styles.group}>
          <legend className={styles.label}>Aviso</legend>
          <div className={styles.chips}>
            {templates.map((t) => (
              <label key={t.trigger} className={styles.chip}>
                <input type="radio" name="notice" checked={trigger === t.trigger} onChange={() => choose(t.trigger)} />
                {t.name}
                {t.trigger === suggested && <span className={styles.muted}> · sugerida</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {template && (
        <>
          <label className={styles.label} htmlFor={`notice-${order.id}`}>
            Texto que se envía
          </label>
          <textarea
            id={`notice-${order.id}`}
            className={styles.textarea}
            rows={5}
            value={body}
            onChange={(e) => {
              setText(e.target.value);
              setOpened(false);
            }}
          />
          <p className={styles.muted}>
            A {phone} por WhatsApp. Lo que cambies aquí vale solo para este envío.
          </p>
        </>
      )}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.actions}>
        <Button
          variant="primary"
          icon={<MessageCircle size={16} aria-hidden />}
          loading={saving}
          disabledReason={missing}
          onClick={send}
        >
          {opened && problem ? "Reintentar apuntarlo" : "Abrir WhatsApp"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </p>
    </div>
  );
}
