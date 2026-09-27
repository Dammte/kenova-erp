"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Send, Settings, RotateCcw, ChevronLeft,
  Copy, Check, MessageCircle,
  Search, Wrench, Clock, CheckCircle2, PackageCheck, XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  useWhatsAppTemplates,
  ServiceStatus,
  DEFAULT_TEMPLATES,
  STATUS_DESCRIPTIONS,
  interpolate,
  type TemplateVariables,
} from "./Usewhatsapptemplates";
import styles from "./Whatsappmodal.module.css";

/* ─── STATUS META ─────────────────────────────────────────────────────────── */
const STATUS_META: Record<ServiceStatus, { Icon: LucideIcon; color: string; bg: string }> = {
  [ServiceStatus.PENDIENTE_CLIENTE]: { Icon: Search,       color: "#6366f1", bg: "#eef2ff" },
  [ServiceStatus.EN_PROGRESO]:      { Icon: Wrench,       color: "#d97706", bg: "#fef3c7" },
  [ServiceStatus.PENDIENTE_PIEZAS]: { Icon: Clock,        color: "#ea580c", bg: "#fff7ed" },
  [ServiceStatus.FINALIZADO]:       { Icon: CheckCircle2, color: "#16a34a", bg: "#dcfce7" },
  [ServiceStatus.ENTREGADO]:        { Icon: PackageCheck, color: "#2563eb", bg: "#dbeafe" },
  [ServiceStatus.CANCELADO]:        { Icon: XCircle,      color: "#dc2626", bg: "#fee2e2" },
};

/* ─── TYPES ───────────────────────────────────────────────────────────────── */
interface WhatsAppModalProps {
  order: {
    id: string;
    status: ServiceStatus;
    client: { firstName: string; lastName?: string; phoneNumber?: string };
    device: { model: string };
    totalPrice?: number;
    balance?: number;
  };
  formatCurrency: (amount: number | undefined) => string;
  formatDate: (date: string) => string;
  onClose: () => void;
}

type ModalView = "preview" | "settings";

const AVAILABLE_VARS = ["{nombre}", "{dispositivo}", "{orden}", "{precio}", "{saldo}"];

/* ─── COMPONENT ───────────────────────────────────────────────────────────── */
export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  order, formatCurrency, formatDate, onClose,
}) => {
  const {
    templates, updateTemplate, resetAllTemplates,
    generateMessage, STATUS_LABELS,
  } = useWhatsAppTemplates();

  const [view, setView]                         = useState<ModalView>("preview");
  const [editedMessage, setEditedMessage]       = useState("");
  const [activeTab, setActiveTab]               = useState<ServiceStatus>(order.status);
  const [draft, setDraft]                       = useState<Record<ServiceStatus, string>>({ ...templates });
  const [copied, setCopied]                     = useState(false);
  const [saved,  setSaved]                      = useState(false);
  const [insertedVar, setInsertedVar]           = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset]   = useState(false);

  const overlayRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const vars: TemplateVariables = {
    nombre:      order.client.firstName,
    dispositivo: order.device.model,
    orden:       order.id.substring(0, 8).toUpperCase(),
    precio:      order.totalPrice != null ? formatCurrency(order.totalPrice) : undefined,
    saldo:       order.balance && order.balance > 0 ? formatCurrency(order.balance) : undefined,
  };

  /* Initial message */
  useEffect(() => {
    setEditedMessage(generateMessage(order.status, vars));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Sync draft when templates update externally */
  useEffect(() => { setDraft({ ...templates }); }, [templates]);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  /* Auto-focus editor textarea */
  useEffect(() => {
    if (view === "settings") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [view, activeTab]);

  /* ─── Handlers ─────────────────────────────────────────────────────────── */
  const handleSend = () => {
    const phone = (order.client.phoneNumber ?? "").replace(/[^\d]/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(editedMessage)}`, "_blank");
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  const handleInsertVar = useCallback((varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? draft[activeTab].length;
    const end   = ta.selectionEnd ?? start;
    const next  = draft[activeTab].slice(0, start) + varKey + draft[activeTab].slice(end);
    setDraft(prev => ({ ...prev, [activeTab]: next }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + varKey.length, start + varKey.length);
    });
    setInsertedVar(varKey);
    setTimeout(() => setInsertedVar(null), 1200);
  }, [draft, activeTab]);

  const handleSave = () => {
    Object.entries(draft).forEach(([status, content]) => {
      updateTemplate(status as ServiceStatus, content);
    });
    const updated = draft[order.status];
    if (updated) setEditedMessage(interpolate(updated, vars));
    setSaved(true);
    setTimeout(() => { setSaved(false); setView("preview"); }, 1100);
  };

  const handleResetCurrent = () => {
    setDraft(prev => ({ ...prev, [activeTab]: DEFAULT_TEMPLATES[activeTab] }));
  };

  const handleResetAll = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    resetAllTemplates();
    setDraft({ ...DEFAULT_TEMPLATES });
    setConfirmingReset(false);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  /* Derived values */
  const charCount  = editedMessage.length;
  const charPct    = Math.min(100, (charCount / 1000) * 100);
  const charColor  = charCount > 900 ? "#ef4444" : charCount > 600 ? "#f59e0b" : "#25d366";
  const { Icon: StatusIcon, color: statusColor, bg: statusBg } = STATUS_META[order.status];

  return (
    <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={styles.modal}>

        {/* ── HEADER ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {view === "settings" && (
              <button className={styles.backButton} onClick={() => setView("preview")} aria-label="Volver">
                <ChevronLeft size={16} />
              </button>
            )}
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="19" height="19">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <h2 className={styles.headerTitle}>
                {view === "preview" ? "Enviar por WhatsApp" : "Configurar plantillas"}
              </h2>
              <p className={styles.headerSubtitle}>
                {view === "preview"
                  ? `${order.client.firstName}${order.client.lastName ? ` ${order.client.lastName}` : ""} · ${order.client.phoneNumber}`
                  : "Personaliza el mensaje de cada estado"}
              </p>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        {/* ═══════ PREVIEW VIEW ═══════ */}
        {view === "preview" && (
          <>
            <div className={styles.previewContent}>
              {/* Status banner */}
              <div className={styles.statusBanner}>
                <div className={styles.statusLeft}>
                  <div
                    className={styles.statusIconWrap}
                    style={{ background: statusBg, borderColor: statusColor + "33" }}
                  >
                    <StatusIcon size={14} color={statusColor} strokeWidth={2.2} />
                  </div>
                  <div className={styles.statusInfo}>
                    <span className={styles.statusLabel}>Estado actual</span>
                    <span className={styles.statusValue} style={{ color: statusColor }}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </div>
                </div>
                <button className={styles.settingsButton} onClick={() => setView("settings")}>
                  <Settings size={12} /> Plantillas
                </button>
              </div>

              {/* Message textarea */}
              <div className={styles.messageSection}>
                <div className={styles.messageLabelRow}>
                  <label className={styles.messageLabel}>
                    <MessageCircle size={13} /> Mensaje
                  </label>
                  <span className={styles.messageHint}>Editable antes de enviar</span>
                </div>
                <textarea
                  className={styles.messageTextarea}
                  value={editedMessage}
                  onChange={e => setEditedMessage(e.target.value)}
                  rows={7}
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Character progress bar */}
            <div className={styles.charBar}>
              <div className={styles.charBarFill} style={{ width: `${charPct}%`, background: charColor }} />
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <span
                className={styles.footerCharCount}
                style={{ color: charCount > 900 ? "#ef4444" : undefined }}
              >
                {charCount}/1000
              </span>
              <button
                className={`${styles.copyButton}${copied ? ` ${styles.copyButtonActive}` : ""}`}
                onClick={handleCopy}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
              <button className={styles.sendButton} onClick={handleSend}>
                <Send size={14} /> Abrir WhatsApp
              </button>
            </div>
          </>
        )}

        {/* ═══════ SETTINGS VIEW ═══════ */}
        {view === "settings" && (
          <div className={styles.settingsView}>
            {/* Status grid */}
            <div className={styles.statusGrid}>
              {Object.values(ServiceStatus).map(status => {
                const isActive  = activeTab === status;
                const isCurrent = order.status === status;
                const { Icon: CardIcon, color: cardColor, bg: cardBg } = STATUS_META[status];
                return (
                  <button
                    key={status}
                    className={`${styles.statusCard}${isActive ? ` ${styles.statusCardActive}` : ""}`}
                    onClick={() => setActiveTab(status)}
                  >
                    {isCurrent && <span className={styles.currentBadge}>Actual</span>}
                    <div
                      className={styles.cardIconWrap}
                      style={{
                        background: isActive ? cardBg : "#f0f0f0",
                        color:      isActive ? cardColor : "#bbb",
                      }}
                    >
                      <CardIcon size={15} strokeWidth={2} />
                    </div>
                    <span className={styles.statusCardName}>{STATUS_LABELS[status]}</span>
                  </button>
                );
              })}
            </div>

            {/* Template editor */}
            <div className={styles.editorBody}>
              <div className={styles.contextBar}>
                <div className={styles.contextInfo}>
                  <p className={styles.contextTitle}>Plantilla — {STATUS_LABELS[activeTab]}</p>
                  <p className={styles.contextDesc}>{STATUS_DESCRIPTIONS[activeTab]}</p>
                </div>
                <button className={styles.resetCurrentBtn} onClick={handleResetCurrent}>
                  <RotateCcw size={12} /> Restaurar
                </button>
              </div>

              <textarea
                ref={textareaRef}
                className={styles.settingsTextarea}
                value={draft[activeTab] ?? ""}
                onChange={e => setDraft(prev => ({ ...prev, [activeTab]: e.target.value }))}
                rows={6}
                spellCheck={false}
                placeholder="Escribe la plantilla aquí..."
              />

              <div className={styles.varSection}>
                <p className={styles.varLabel}>Insertar variable</p>
                <div className={styles.varTags}>
                  {AVAILABLE_VARS.map(key => (
                    <button
                      key={key}
                      className={`${styles.varTag}${insertedVar === key ? ` ${styles.varTagDone}` : ""}`}
                      onClick={() => handleInsertVar(key)}
                    >
                      {insertedVar === key ? <><Check size={10} /> {key}</> : key}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <button
                className={`${styles.resetAllButton}${confirmingReset ? ` ${styles.resetAllButtonConfirm}` : ""}`}
                onClick={handleResetAll}
              >
                <RotateCcw size={12} />
                {confirmingReset ? "¿Confirmar reset?" : "Restaurar todo"}
              </button>
              <button
                className={`${styles.saveButton}${saved ? ` ${styles.saveButtonSaved}` : ""}`}
                onClick={handleSave}
              >
                <Check size={13} /> {saved ? "¡Guardado!" : "Guardar"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
