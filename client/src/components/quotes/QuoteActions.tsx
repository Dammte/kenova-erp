"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardPlus, MessageCircle, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { quoteWhatsappText, whatsappLink, type QuoteDetail } from "./quotes";
import styles from "./Quotes.module.css";

interface PriceChange {
  description: string;
  before: string;
  after: string;
}

/** What renewing says back: the prices that moved, or that none did. */
export function renewNotice(changes: PriceChange[]): string {
  if (changes.length === 0) return "Renovado 30 días. Los precios no han cambiado.";
  const list = changes.map((c) => `${c.description}: ${formatEur(c.before)} → ${formatEur(c.after)}`).join("; ");
  return `Renovado 30 días con las tarifas de hoy. Cambian: ${list}. Revísalo antes de enviarlo.`;
}

/**
 * Design 2.4: one main action per status, so nobody has to think what comes
 * next. Draft: send by WhatsApp. Sent: the client accepted, so it becomes an
 * order through the intake, already filled in. Expired: renew. Any open quote can
 * be marked rejected, and anything not accepted can be deleted.
 */
export function QuoteActions({
  quote,
  onChanged,
  onDeleted,
}: {
  quote: QuoteDetail;
  onChanged: (q: QuoteDetail, notice?: string) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const open = quote.status === "draft" || quote.status === "sent" || quote.status === "expired";

  const call = async (path: string, method: "POST" | "DELETE" = "POST") => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/quotes/${quote.id}${path}`, { method });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido hacer."));
        return null;
      }
      return res.status === 204 ? {} : ((await res.json()) as unknown);
    } catch {
      setProblem("Comprueba la conexión.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sendWhatsapp = async () => {
    const link = whatsappLink(quote.clientPhone, quoteWhatsappText(quote));
    if (!link) {
      setProblem("No se puede abrir WhatsApp: el teléfono del cliente no es válido. Corrígelo en el borrador.");
      return;
    }
    // Opened before the request, or the browser takes it for a pop-up.
    window.open(link, "_blank", "noopener");
    const q = (await call("/send")) as QuoteDetail | null;
    if (q) onChanged(q, "Marcado como enviado.");
  };

  return (
    <div className={styles.quoteActions}>
      <p className={styles.actions}>
        {quote.status === "sent" && (
          <Link className={styles.primaryLink} href={`/ordenes/nueva?presupuesto=${quote.id}`}>
            <ClipboardPlus size={16} aria-hidden /> Aceptado: convertir en orden
          </Link>
        )}
        {(quote.status === "draft" || quote.status === "sent") && (
          <Button
            variant={quote.status === "draft" ? "primary" : "secondary"}
            icon={<MessageCircle size={16} aria-hidden />}
            loading={busy}
            onClick={() => void sendWhatsapp()}
          >
            {quote.status === "draft" ? "Enviar por WhatsApp" : "Reenviar por WhatsApp"}
          </Button>
        )}
        {quote.status === "expired" && (
          <Button
            variant="primary"
            icon={<RefreshCw size={16} aria-hidden />}
            loading={busy}
            onClick={async () => {
              const r = (await call("/renew")) as { quote: QuoteDetail; changes: PriceChange[] } | null;
              if (r) onChanged(r.quote, renewNotice(r.changes));
            }}
          >
            Renovar 30 días
          </Button>
        )}
        {open && (
          <Button
            variant="ghost"
            icon={<X size={16} aria-hidden />}
           
            onClick={async () => {
              const q = (await call("/reject")) as QuoteDetail | null;
              if (q) onChanged(q, "Marcado como rechazado.");
            }}
          >
            Rechazado
          </Button>
        )}
        {quote.status !== "accepted" && !confirmDelete && (
          <Button variant="ghost" icon={<Trash2 size={16} aria-hidden />} onClick={() => setConfirmDelete(true)}>
            Borrar
          </Button>
        )}
      </p>
      {confirmDelete && (
        <p className={styles.actions} role="group" aria-label="Confirmar borrado">
          <span>¿Borrar {quote.code}? No se puede deshacer.</span>
          <Button
            variant="danger"
            size="sm"
           
            onClick={async () => {
              if (await call("", "DELETE")) onDeleted();
            }}
          >
            Sí, borrar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
            No
          </Button>
        </p>
      )}
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
    </div>
  );
}
