"use client";

import { API_URL, apiFetch } from "@/lib/api";

/**
 * ClientHistoryModal
 * Panel lateral que muestra el historial de órdenes de servicio de un cliente.
 * Se abre al pulsar el nombre del cliente en la tabla de service orders.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import {
  X,
  Smartphone,
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  Wrench,
  Package,
} from "lucide-react";
import Link from "next/link";
import { ServiceOrder, ServiceHistoryEntry } from "@/app/serviceOrders/types";
import { STATUS_LABELS } from "@/app/serviceOrders/constants";
import { formatDate, formatCurrency } from "@/app/serviceOrders/utils/format";

const API = API_URL;

interface ClientHistoryModalProps {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  onClose: () => void;
}

interface OrderWithHistory extends ServiceOrder {
  _history?: ServiceHistoryEntry[];
  _historyLoading?: boolean;
  _historyLoaded?: boolean;
  _expanded?: boolean;
}

export function ClientHistoryModal({
  clientId,
  clientName,
  clientPhone,
  clientEmail,
  onClose,
}: ClientHistoryModalProps) {
  const [orders, setOrders] = useState<OrderWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  // Cargar órdenes del cliente
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`${API}/service-orders/client/${clientId}`)
      .then((r) => r.json())
      .then((data: ServiceOrder[]) => {
        if (!cancelled) {
          // Ordenar de más reciente a más antigua
          const sorted = [...data].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          setOrders(sorted.map((o) => ({ ...o, _expanded: false })));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [clientId]);

  // Cargar historial de una orden al expandirla
  const loadHistory = useCallback(async (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, _historyLoading: true } : o,
      ),
    );
    try {
      const res = await apiFetch(`${API}/service-history/order/${orderId}`);
      const history: ServiceHistoryEntry[] = res.ok ? await res.json() : [];
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, _history: history, _historyLoading: false, _historyLoaded: true }
            : o,
        ),
      );
    } catch {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, _historyLoading: false, _historyLoaded: true, _history: [] } : o,
        ),
      );
    }
  }, []);

  const toggleExpand = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const willExpand = !o._expanded;
        if (willExpand && !o._historyLoaded && !o._historyLoading) {
          void loadHistory(orderId);
        }
        return { ...o, _expanded: willExpand };
      }),
    );
  };

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div ref={panelRef} style={panel}>

        {/* Header */}
        <div style={header}>
          <div>
            <div style={headerName}>{clientName}</div>
            <div style={headerMeta}>
              {clientPhone && <span>{clientPhone}</span>}
              {clientPhone && clientEmail && <span style={{ opacity: 0.4 }}> · </span>}
              {clientEmail && <span>{clientEmail}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link
              href={`/clients/${clientId}`}
              style={linkBtn}
              title="Abrir ficha del cliente"
              target="_blank"
            >
              <ExternalLink size={14} />
              <span>Ficha</span>
            </Link>
            <button onClick={onClose} style={closeBtn} title="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contador */}
        <div style={counterBar}>
          {loading ? (
            <span style={{ color: "#94a3b8" }}>Cargando historial…</span>
          ) : (
            <span>
              <strong style={{ color: "#1e293b" }}>{orders.length}</strong>
              {" "}orden{orders.length !== 1 ? "es" : ""} registrada{orders.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Lista de órdenes */}
        <div style={orderList}>
          {loading && (
            <div style={emptyState}>
              <div style={spinner} />
            </div>
          )}

          {!loading && orders.length === 0 && (
            <div style={emptyState}>
              <ClipboardList size={36} style={{ color: "#cbd5e1", marginBottom: 10 }} />
              <p style={{ color: "#94a3b8", margin: 0 }}>Sin órdenes registradas</p>
            </div>
          )}

          {!loading &&
            orders.map((order) => (
              <div key={order.id} style={orderCard}>
                {/* Fila resumen — siempre visible */}
                <div
                  style={orderRow}
                  onClick={() => toggleExpand(order.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && toggleExpand(order.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>
                      {order._expanded ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </span>
                    <div>
                      <div style={deviceLine}>
                        <Smartphone size={12} style={{ color: "#64748b", flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>
                          {order.device
                            ? `${order.device.brand ? order.device.brand + " " : ""}${order.device.model}`
                            : "Sin dispositivo"}
                        </span>
                      </div>
                      <div style={dateLine}>
                        <Calendar size={11} style={{ color: "#94a3b8" }} />
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <span style={statusBadge(order.status)}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    {order.totalPrice != null && (
                      <span style={priceBadge}>{formatCurrency(order.totalPrice)}</span>
                    )}
                  </div>
                </div>

                {/* Detalle expandido */}
                {order._expanded && (
                  <div style={expandedBody}>

                    {/* Servicios */}
                    {order.services && order.services.length > 0 && (
                      <div style={detailBlock}>
                        <div style={detailLabel}>
                          <Wrench size={12} />
                          Servicios
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {order.services.map((s, i) => (
                            <span key={i} style={serviceChip}>
                              {s.name ?? s.description ?? "—"}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Historial de trabajo */}
                    <div style={detailBlock}>
                      <div style={detailLabel}>
                        <ClipboardList size={12} />
                        Notas del técnico
                      </div>

                      {order._historyLoading && (
                        <div style={{ color: "#94a3b8", fontSize: 13 }}>Cargando…</div>
                      )}

                      {order._historyLoaded && order._history && order._history.length > 0 ? (
                        <div style={historyList}>
                          {order._history.map((entry) => (
                            <div key={entry.id} style={historyEntry}>
                              <div style={historyEntryHeader}>
                                <span style={historyAction}>{entry.action}</span>
                                <span style={historyDate}>{formatDate(entry.performedAt)}</span>
                              </div>
                              <p style={historyDescription}>{entry.description}</p>
                              {entry.partsReplaced && (
                                <div style={historyParts}>
                                  <Package size={11} style={{ flexShrink: 0 }} />
                                  <span>{entry.partsReplaced}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : order._historyLoaded ? (
                        <span style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>
                          Sin notas registradas para esta orden
                        </span>
                      ) : null}
                    </div>

                    {/* Observaciones de la orden */}
                    {order.observations && (
                      <div style={detailBlock}>
                        <div style={detailLabel}>Observaciones</div>
                        <p style={obsText}>{order.observations}</p>
                      </div>
                    )}

                    {/* Link a la orden */}
                    <div style={{ marginTop: 12 }}>
                      <Link href={`/serviceOrders/${order.id}/edit`} style={viewOrderLink}>
                        <ExternalLink size={12} />
                        Ver orden completa
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── Estilos inline ───────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  backdropFilter: "blur(3px)",
  zIndex: 1100,
  display: "flex",
  justifyContent: "flex-end",
};

const panel: React.CSSProperties = {
  width: "min(480px, 100vw)",
  height: "100dvh",
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  boxShadow: "-6px 0 32px rgba(15, 23, 42, 0.14)",
};

const header: React.CSSProperties = {
  padding: "20px 20px 16px",
  borderBottom: "1.5px solid #f1f5f9",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  background: "#f8fafc",
};

const headerName: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: "#0f172a",
  lineHeight: 1.3,
};

const headerMeta: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 3,
};

const counterBar: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: 13,
  color: "#64748b",
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
};

const closeBtn: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "#64748b",
  padding: 6,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  transition: "background 0.15s, color 0.15s",
};

const linkBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 500,
  color: "#4f6ef7",
  background: "#eef1fe",
  border: "none",
  borderRadius: 7,
  padding: "5px 10px",
  textDecoration: "none",
  cursor: "pointer",
};

const orderList: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const orderCard: React.CSSProperties = {
  border: "1.5px solid #e2e8f0",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const orderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  cursor: "pointer",
  transition: "background 0.12s",
  gap: 8,
};

const deviceLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  marginBottom: 2,
};

const dateLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  color: "#94a3b8",
};

const statusBadge = (status: string): React.CSSProperties => {
  const map: Record<string, { bg: string; color: string }> = {
    en_progreso: { bg: "#dbeafe", color: "#1d4ed8" },
    finalizado:  { bg: "#d1fae5", color: "#065f46" },
    entregado:   { bg: "#f0fdf4", color: "#166534" },
    cancelado:   { bg: "#fee2e2", color: "#991b1b" },
    pendiente_cliente: { bg: "#fef9c3", color: "#854d0e" },
    pendiente_piezas:  { bg: "#fde8cc", color: "#92400e" },
  };
  const c = map[status] ?? { bg: "#f1f5f9", color: "#475569" };
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 99,
    background: c.bg,
    color: c.color,
    whiteSpace: "nowrap",
  };
};

const priceBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#059669",
  whiteSpace: "nowrap",
};

const expandedBody: React.CSSProperties = {
  padding: "12px 14px 14px",
  borderTop: "1px solid #f1f5f9",
  background: "#f8fafc",
};

const detailBlock: React.CSSProperties = {
  marginBottom: 14,
};

const detailLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const serviceChip: React.CSSProperties = {
  fontSize: 12,
  padding: "3px 9px",
  background: "#eef1fe",
  color: "#4f6ef7",
  borderRadius: 99,
  fontWeight: 500,
};

const historyList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const historyEntry: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 9,
  padding: "10px 12px",
};

const historyEntryHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 5,
};

const historyAction: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#4f6ef7",
};

const historyDate: React.CSSProperties = {
  fontSize: 11,
  color: "#94a3b8",
};

const historyDescription: React.CSSProperties = {
  fontSize: 13,
  color: "#334155",
  margin: "0 0 4px",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const historyParts: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
};

const obsText: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  margin: 0,
  lineHeight: 1.5,
  fontStyle: "italic",
};

const viewOrderLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
  fontWeight: 500,
  color: "#4f6ef7",
  textDecoration: "none",
};

const emptyState: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 60,
};

const spinner: React.CSSProperties = {
  width: 28,
  height: 28,
  border: "2px solid #e2e8f0",
  borderTop: "2px solid #4f6ef7",
  borderRadius: "50%",
  animation: "spin 0.9s linear infinite",
};
