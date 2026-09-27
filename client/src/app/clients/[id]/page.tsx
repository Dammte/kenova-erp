"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Edit,
  Mail,
  Phone,
  MessageSquare,
  Trash2,
  Wrench,
  Clock,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import styles from "./page.module.css";
import { showToast } from "nextjs-toast-notify";

const API = API_URL;

const ContactMethod = { EMAIL: "EMAIL", PHONE: "PHONE", SMS: "SMS" };

const STATUS_LABELS: Record<string, string> = {
  pendiente_cliente: "Pendiente Cliente",
  en_progreso: "En Progreso",
  pendiente_piezas: "Pend. Piezas",
  finalizado: "Finalizado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pendiente_cliente: { bg: "#eff6ff", color: "#2563eb" },
  en_progreso: { bg: "#fffbeb", color: "#d97706" },
  pendiente_piezas: { bg: "#f3effe", color: "#7c3aed" },
  finalizado: { bg: "#fff7ed", color: "#ea6c0a" },
  entregado: { bg: "#ecfdf5", color: "#059669" },
  cancelado: { bg: "#fef2f2", color: "#dc2626" },
};

const fEur = (v: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);

interface ClientOrder {
  id: string;
  status: string;
  priority: string;
  totalPrice?: number;
  amountPaid?: number;
  createdAt: string;
  device?: { brand?: string; model?: string; type?: string } | null;
  services?: { name?: string }[];
}

export default function ClientDetail() {
  const router = useRouter();
  const { id } = useParams();
  const [client, setClient] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const response = await apiFetch(`${API}/clients/${id}`);
        if (!response.ok) throw new Error("Cliente no encontrado");
        const data = await response.json();
        setClient(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchClient();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoadingOrders(true);
    apiFetch(`${API}/service-orders/client/${id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoadingOrders(false));
  }, [id]);

  const renderContactIcon = (method: string) => {
    switch (method) {
      case ContactMethod.EMAIL: return <Mail className={styles.contactIcon} />;
      case ContactMethod.PHONE: return <Phone className={styles.contactIcon} />;
      case ContactMethod.SMS: return <MessageSquare className={styles.contactIcon} />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando cliente...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <p>{error}</p>
        <Link href="/clients" className={styles.backButton}>
          <ChevronLeft size={16} /> Volver a clientes
        </Link>
      </div>
    );
  }

  if (!client) {
    showToast.error("No se pudo cargar la información del cliente.");
    return null;
  }

  const activeOrders = orders.filter(
    (o) => o.status !== "entregado" && o.status !== "cancelado"
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/clients" className={styles.backButton}>
          <ChevronLeft size={20} /> Volver
        </Link>
        <div className={styles.headerActions}>
          <button
            className={styles.editButton}
            onClick={() => router.push(`/clients/${id}/edit`)}
          >
            <Edit size={16} /> Editar
          </button>
          <button className={styles.deleteButton}>
            <Trash2 size={16} /> Eliminar
          </button>
        </div>
      </div>

      <div className={styles.clientHeader}>
        <div className={styles.avatar}>
          {client.firstName?.charAt(0)}
          {client.lastName?.charAt(0)}
        </div>
        <h1>{`${client.firstName} ${client.lastName}`}</h1>
        <span className={styles.clientId}>ID: {client.id}</span>
        {/* Badges de resumen */}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {orders.length > 0 && (
            <span style={{ fontSize: "0.78rem", background: "#eff6ff", color: "#2563eb", borderRadius: 999, padding: "2px 10px", fontWeight: 600 }}>
              {orders.length} orden{orders.length !== 1 ? "es" : ""}
            </span>
          )}
          {activeOrders.length > 0 && (
            <span style={{ fontSize: "0.78rem", background: "#fffbeb", color: "#d97706", borderRadius: 999, padding: "2px 10px", fontWeight: 600 }}>
              {activeOrders.length} activa{activeOrders.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className={styles.detailsGrid}>
        {/* Información Personal */}
        <div className={styles.section}>
          <h2>Información Personal</h2>
          <div className={styles.detailItem}>
            <label>Tipo de documento</label>
            <p>{client.dniType}</p>
          </div>
          <div className={styles.detailItem}>
            <label>Número de documento</label>
            <p>{client.dni}</p>
          </div>
          <div className={styles.detailItem}>
            <label>Fecha de registro</label>
            <p>{new Date(client.createdAt).toLocaleDateString("es-ES")}</p>
          </div>
        </div>

        {/* Contacto */}
        <div className={styles.section}>
          <h2>Información de Contacto</h2>
          <div className={styles.detailItem}>
            <label>Email</label>
            <p>{client.email || "-"}</p>
          </div>
          <div className={styles.detailItem}>
            <label>Teléfono</label>
            <p>{client.phoneNumber || "-"}</p>
          </div>
          <div className={styles.detailItem}>
            <label>Método preferido</label>
            <div className={styles.contactMethod}>
              {renderContactIcon(client.preferredContact)}
              <span>{client.preferredContact}</span>
            </div>
          </div>
        </div>

        {/* Ubicación */}
        <div className={styles.section}>
          <h2>Ubicación</h2>
          <div className={styles.detailItem}>
            <label>Dirección</label>
            <p>{client.address || "-"}</p>
          </div>
          <div className={styles.detailItem}>
            <label>Código Postal</label>
            <p>{client.postalCode || "-"}</p>
          </div>
          <div className={styles.detailItem}>
            <label>Ciudad</label>
            <p>{client.city || "-"}</p>
          </div>
        </div>

        {/* Observaciones */}
        <div className={styles.fullWidthSection}>
          <h2>Observaciones</h2>
          <div className={styles.observations}>
            {client.observations || "No hay observaciones registradas"}
          </div>
        </div>
      </div>

      {/* ── Historial de órdenes ── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Wrench size={16} color="#ea6c0a" />
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
            Historial de órdenes
          </h2>
          {orders.length > 0 && (
            <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 999, fontSize: "0.75rem", padding: "1px 8px", fontWeight: 600 }}>
              {orders.length}
            </span>
          )}
        </div>

        {loadingOrders ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: "0.85rem", padding: "16px 0" }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Cargando órdenes…
          </div>
        ) : orders.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: "0.85rem", padding: "16px 0", fontStyle: "italic" }}>
            <CheckCircle2 size={16} />
            Este cliente no tiene órdenes registradas
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {orders.map((order) => {
              const cfg = STATUS_COLORS[order.status] ?? { bg: "#f1f5f9", color: "#64748b" };
              const days = Math.floor(
                (Date.now() - new Date(order.createdAt).getTime()) / 86_400_000
              );
              const isActive = order.status !== "entregado" && order.status !== "cancelado";
              const deviceLabel = order.device
                ? [order.device.brand, order.device.model].filter(Boolean).join(" ") || order.device.type
                : null;

              return (
                <Link
                  key={order.id}
                  href={`/serviceOrders/${order.id}/edit`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "1px solid rgba(99,120,160,0.12)",
                    background: "var(--card-bg, #fff)",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "box-shadow 0.15s",
                  }}
                >
                  {/* Estado */}
                  <span style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    background: cfg.bg,
                    color: cfg.color,
                    whiteSpace: "nowrap",
                    minWidth: 110,
                    textAlign: "center",
                  }}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>

                  {/* Dispositivo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.85rem", fontWeight: 600 }}>
                      <Smartphone size={13} color="#64748b" />
                      <span>{deviceLabel ?? "Sin dispositivo"}</span>
                    </div>
                    {order.services && order.services.length > 0 && (
                      <div style={{ fontSize: "0.73rem", color: "#94a3b8", marginTop: 2 }}>
                        {order.services.slice(0, 2).map(s => s.name).filter(Boolean).join(" · ")}
                        {order.services.length > 2 && ` +${order.services.length - 2}`}
                      </div>
                    )}
                  </div>

                  {/* Precio */}
                  {order.totalPrice != null && Number(order.totalPrice) > 0 && (
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#059669", whiteSpace: "nowrap" }}>
                      {fEur(Number(order.totalPrice))}
                    </span>
                  )}

                  {/* Edad de la orden */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: 64 }}>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                      {new Date(order.createdAt).toLocaleDateString("es-ES")}
                    </span>
                    {isActive && (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        background: days >= 7 ? "#fef2f2" : "#f1f5f9",
                        color: days >= 7 ? "#dc2626" : "#64748b",
                        borderRadius: 999,
                        padding: "1px 6px",
                      }}>
                        <Clock size={9} />
                        {days === 0 ? "hoy" : `${days}d`}
                      </span>
                    )}
                  </div>

                  <AlertCircle size={14} color="#c4cfe0" style={{ flexShrink: 0 }} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
