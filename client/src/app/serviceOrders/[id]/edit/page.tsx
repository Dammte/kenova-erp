"use client";

import { API_URL, apiFetch } from "@/lib/api";
import UnlockSecretReveal, { UnlockSecretType } from "@/components/serviceOrders/UnlockSecretReveal";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  Smartphone,
  Wrench,
  CreditCard,
  FileText,
  Activity,
  AlertTriangle,
  Save,
  X,
  Check,
  Edit2,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  Hash,
  Clock,
  Loader2,
  Plus,
  Search,
  Banknote,
  ArrowRightLeft,
  ChevronDown,
  KeyRound,
  Fingerprint,
  ExternalLink,
  ClipboardList,
  Package,
} from "lucide-react";
import { showToast } from "nextjs-toast-notify";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  PAYMENT_METHOD_LABELS,
} from "../../constants";
import styles from "./page.module.css";
import PatternLock from "@/components/serviceOrders/PatternLock";

// ── Types ──────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  dniType: "NIF" | "NIE" | "PASSPORT";
  dni: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  preferredContact: "EMAIL" | "PHONE" | "SMS";
  observations?: string;
  isActive: boolean;
}

interface Device {
  id: string;
  imei?: string;
  inventoryCode: string;
  type: string;
  brand: string;
  model: string;
  /** Set when an unlock PIN/pattern is stored (encrypted). The value itself never comes with the order. */
  unlockSecretType?: UnlockSecretType | null;
  /** Write-only form fields: a value replaces the stored secret, empty keeps it. */
  code?: string;
  pattern?: string;
  observations?: string;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  price: number;
  estimatedTime?: number;
}

interface ServiceHistoryEntry {
  id: string;
  action: string;
  description: string;
  partsReplaced?: string;
  partsCost?: number;
  performedAt: string;
}

type OrderStatus =
  | "pendiente_cliente"
  | "en_progreso"
  | "pendiente_piezas"
  | "finalizado"
  | "entregado"
  | "cancelado";
type OrderPriority = "low" | "medium" | "high" | "urgent";
type PaymentStatus = "pending" | "paid_partial" | "paid";
type PaymentMethod = "cash" | "card" | "transfer";

interface ServiceOrder {
  id: string;
  client: Client;
  device: Device;
  services: Service[];
  priority: OrderPriority;
  assignedTo?: string;
  status: OrderStatus;
  totalPrice?: number;
  amountPaid?: number;
  balance?: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  observations?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Config ─────────────────────────────────────────────────────────────────

const STATUS_FLOW: OrderStatus[] = [
  "pendiente_cliente",
  "en_progreso",
  "pendiente_piezas",
  "finalizado",
  "entregado",
];

const STATUS_CFG: Record<
  OrderStatus,
  { color: string; bg: string; label: string }
> = {
  pendiente_cliente: { color: "#2563eb", bg: "#eff6ff", label: STATUS_LABELS.pendiente_cliente },
  en_progreso: { color: "#d97706", bg: "#fffbeb", label: STATUS_LABELS.en_progreso },
  pendiente_piezas: { color: "#7c3aed", bg: "#f3effe", label: STATUS_LABELS.pendiente_piezas },
  finalizado: { color: "#ea6c0a", bg: "#fff7ed", label: STATUS_LABELS.finalizado },
  entregado: { color: "#059669", bg: "#ecfdf5", label: STATUS_LABELS.entregado },
  cancelado: { color: "#dc2626", bg: "#fef2f2", label: STATUS_LABELS.cancelado },
};

const PRIORITY_CFG: Record<
  OrderPriority,
  { color: string; bg: string; label: string }
> = {
  low: { color: "#2563eb", bg: "#eff6ff", label: PRIORITY_LABELS.low },
  medium: { color: "#d97706", bg: "#fffbeb", label: PRIORITY_LABELS.medium },
  high: { color: "#dc2626", bg: "#fef2f2", label: PRIORITY_LABELS.high },
  urgent: { color: "#b91c1c", bg: "#fef2f2", label: PRIORITY_LABELS.urgent },
};

const API = API_URL;

const fEur = (v: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);

// ── Component ──────────────────────────────────────────────────────────────

export default function ServiceOrderEdit() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  // ── Core data
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Order form
  const [formData, setFormData] = useState({
    status: "pendiente_cliente" as OrderStatus,
    priority: "medium" as OrderPriority,
    assignedTo: "",
    totalPrice: 0,
    amountPaid: 0,
    paymentStatus: "pending" as PaymentStatus,
    paymentMethod: "cash" as PaymentMethod,
    observations: "",
  });
  const [saving, setSaving] = useState(false);

  // ── Services
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchService, setSearchService] = useState("");
  const [newService, setNewService] = useState({
    name: "",
    description: "",
    price: 0,
    estimatedTime: 0,
  });
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Client editing
  const [editingClient, setEditingClient] = useState(false);
  const [clientForm, setClientForm] = useState<Partial<Client>>({});
  const [savingClient, setSavingClient] = useState(false);

  // ── Device editing
  const [editingDevice, setEditingDevice] = useState(false);
  const [deviceForm, setDeviceForm] = useState<Partial<Device>>({});
  const [savingDevice, setSavingDevice] = useState(false);

  // ── Work history
  const [workHistory, setWorkHistory] = useState<ServiceHistoryEntry[]>([]);

  // ── Accordion: which sidebar sections are expanded (status + payment open by default)
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["payment"])
  );
  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;
    (async () => {
      try {
        setLoading(true);
        const [orderRes, servicesRes, historyRes] = await Promise.all([
          apiFetch(`${API}/service-orders/${orderId}?include=client,device,services`),
          apiFetch(`${API}/services`),
          apiFetch(`${API}/service-history/order/${orderId}`),
        ]);
        if (!orderRes.ok) throw new Error(`HTTP ${orderRes.status}`);
        const data: ServiceOrder = await orderRes.json();

        setOrder(data);
        // PostgreSQL DECIMAL columns come back as strings — always parse to number
        setFormData({
          status: data.status ?? "pendiente_cliente",
          priority: data.priority ?? "medium",
          assignedTo: data.assignedTo ?? "",
          totalPrice: Number(data.totalPrice) || 0,
          amountPaid: Number(data.amountPaid) || 0,
          paymentStatus: data.paymentStatus ?? "pending",
          paymentMethod: data.paymentMethod ?? "cash",
          observations: data.observations ?? "",
        });
        setSelectedServices(data.services ?? []);
        setClientForm({
          dniType: data.client.dniType,
          dni: data.client.dni,
          firstName: data.client.firstName,
          lastName: data.client.lastName,
          email: data.client.email,
          phoneNumber: data.client.phoneNumber,
          address: data.client.address,
          postalCode: data.client.postalCode,
          city: data.client.city,
        });
        setDeviceForm(
          data.device
            ? {
                brand: data.device.brand,
                model: data.device.model,
                type: data.device.type,
                imei: data.device.imei,
                code: "",
                pattern: "",
                observations: data.device.observations,
              }
            : {}
        );

        if (servicesRes.ok) {
          const svcData: unknown = await servicesRes.json();
          setAvailableServices(Array.isArray(svcData) ? svcData : []);
        }
        if (historyRes.ok) {
          const histData: unknown = await historyRes.json();
          setWorkHistory(Array.isArray(histData) ? histData : []);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Error al cargar la orden");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  // Cleanup debounce on unmount
  useEffect(
    () => () => {
      if (syncRef.current) clearTimeout(syncRef.current);
    },
    []
  );

  // ── Services sync (debounced) ─────────────────────────────────────────────
  const syncServices = useCallback(
    (services: Service[]) => {
      if (syncRef.current) clearTimeout(syncRef.current);
      syncRef.current = setTimeout(async () => {
        setIsSyncing(true);
        try {
          const res = await apiFetch(`${API}/service-orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceIds: services.map((s) => s.id) }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const updated: ServiceOrder = await res.json();
          setFormData((p) => ({
            ...p,
            totalPrice: Number(updated.totalPrice) || p.totalPrice,
          }));
          showToast.success("Servicios actualizados", { duration: 2000, position: "top-right" });
        } catch {
          showToast.error("Error al sincronizar servicios", { duration: 3000, position: "top-right" });
        } finally {
          setIsSyncing(false);
        }
      }, 1500);
    },
    [orderId]
  );

  const handleAddService = (service: Service) => {
    if (selectedServices.find((s) => s.id === service.id)) return;
    const next = [...selectedServices, service];
    setSelectedServices(next);
    setFormData((p) => ({ ...p, totalPrice: next.reduce((a, s) => a + Number(s.price), 0) }));
    syncServices(next);
    setShowServiceModal(false);
    setSearchService("");
  };

  const handleRemoveService = (id: string) => {
    const next = selectedServices.filter((s) => s.id !== id);
    setSelectedServices(next);
    setFormData((p) => ({ ...p, totalPrice: next.reduce((a, s) => a + Number(s.price), 0) }));
    syncServices(next);
  };

  const handleCreateService = async () => {
    if (!newService.name || newService.price <= 0) return;
    try {
      const res = await apiFetch(`${API}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newService),
      });
      if (!res.ok) throw new Error();
      const created: Service = await res.json();
      setAvailableServices((p) => [...p, created]);
      handleAddService(created);
      setShowCreateModal(false);
      setNewService({ name: "", description: "", price: 0, estimatedTime: 0 });
    } catch {
      showToast.error("Error al crear el servicio", { duration: 3000, position: "top-right" });
    }
  };

  // ── Save order ────────────────────────────────────────────────────────────
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSaving(true);
    try {
      // Never send `balance` or `paymentStatus` — the server recalculates both
      // from totalPrice/amountPaid. Always send numbers, not PostgreSQL strings.
      const body = {
        status: formData.status,
        priority: formData.priority,
        assignedTo: formData.assignedTo || undefined,
        totalPrice: Number(formData.totalPrice),
        amountPaid: Number(formData.amountPaid),
        paymentMethod: formData.paymentMethod || undefined,
        observations: formData.observations || undefined,
        serviceIds: selectedServices.map((s) => s.id),
      };

      const res = await apiFetch(`${API}/service-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg =
          (Array.isArray(errData.message)
            ? (errData.message as string[]).join(", ")
            : errData.message as string) ||
          (errData.error as string) ||
          `Error del servidor (${res.status})`;
        throw new Error(msg);
      }

      showToast.success("Orden guardada correctamente", { duration: 3000, position: "top-right" });
      router.push(`/serviceOrders/${orderId}`);
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Error al guardar la orden",
        { duration: 5000, position: "top-right" }
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Save client ───────────────────────────────────────────────────────────
  const handleSaveClient = async () => {
    if (!order) return;
    setSavingClient(true);
    try {
      const res = await apiFetch(`${API}/clients/${order.client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientForm),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg =
          (Array.isArray(errData.message)
            ? (errData.message as string[]).join(", ")
            : errData.message as string) ||
          `Error ${res.status}`;
        throw new Error(msg);
      }
      const updated: Client = await res.json();
      setOrder((p) => (p ? { ...p, client: updated } : p));
      setEditingClient(false);
      showToast.success("Cliente actualizado", { duration: 2000, position: "top-right" });
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Error al actualizar el cliente",
        { duration: 4000, position: "top-right" }
      );
    } finally {
      setSavingClient(false);
    }
  };

  const cancelClientEdit = () => {
    if (!order) return;
    setEditingClient(false);
    setClientForm({
      dniType: order.client.dniType,
      dni: order.client.dni,
      firstName: order.client.firstName,
      lastName: order.client.lastName,
      email: order.client.email,
      phoneNumber: order.client.phoneNumber,
      address: order.client.address,
      postalCode: order.client.postalCode,
      city: order.client.city,
    });
  };

  // ── Save device ───────────────────────────────────────────────────────────
  // Device controller only exposes PUT (not PATCH).
  const handleSaveDevice = async () => {
    if (!order || !order.device) return;
    setSavingDevice(true);
    try {
      const res = await apiFetch(`${API}/devices/${order.device.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deviceForm),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg =
          (Array.isArray(errData.message)
            ? (errData.message as string[]).join(", ")
            : errData.message as string) ||
          `Error ${res.status}`;
        throw new Error(msg);
      }
      // The server returns the updated device (never the PIN/pattern itself).
      const updatedDevice: Device = await res.json();
      setOrder((p) => (p ? { ...p, device: updatedDevice } : p));
      setDeviceForm((p) => ({ ...p, code: "", pattern: "" }));
      setEditingDevice(false);
      showToast.success("Dispositivo actualizado", { duration: 2000, position: "top-right" });
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Error al actualizar el dispositivo",
        { duration: 4000, position: "top-right" }
      );
    } finally {
      setSavingDevice(false);
    }
  };

  const cancelDeviceEdit = () => {
    if (!order) return;
    setEditingDevice(false);
    setDeviceForm(
      order.device
        ? {
            brand: order.device.brand,
            model: order.device.model,
            type: order.device.type,
            imei: order.device.imei,
            code: "",
            pattern: "",
            observations: order.device.observations,
          }
        : {}
    );
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const balance = formData.totalPrice - formData.amountPaid;
  const paymentPct =
    formData.totalPrice > 0
      ? Math.min((formData.amountPaid / formData.totalPrice) * 100, 100)
      : 0;

  const filteredServices = availableServices.filter(
    (s) =>
      s.name.toLowerCase().includes(searchService.toLowerCase()) &&
      !selectedServices.find((sel) => sel.id === s.id)
  );

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.centerScreen}>
        <Loader2 className={styles.spinIcon} size={32} />
        <span>Cargando orden de servicio…</span>
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className={styles.centerScreen}>
        <div className={styles.errorCard}>
          <AlertCircle size={28} className={styles.errIcon} />
          <h2>Error al cargar</h2>
          <p>{loadError ?? "Orden de servicio no encontrada"}</p>
          <button className={styles.btnPrimary} onClick={() => router.back()}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* ── HEADER ── */}
      <header className={styles.header}>
        <div className={styles.hLeft}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => router.back()}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className={styles.pageTitle}>Editar Orden</h1>
            <span className={styles.orderId}>#{orderId.slice(0, 8)}</span>
          </div>
        </div>
        <div className={styles.hRight}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => router.back()}
          >
            <X size={14} />
            Cancelar
          </button>
          <button
            type="submit"
            form="order-form"
            className={styles.btnPrimary}
            disabled={saving}
          >
            {saving ? (
              <Loader2 size={14} className={styles.spinIconSm} />
            ) : (
              <Save size={14} />
            )}
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </header>

      <form id="order-form" onSubmit={handleSaveOrder}>
        <div className={styles.layout}>
          {/* ══════════════════════════════════════════════
              LEFT COLUMN
          ══════════════════════════════════════════════ */}
          <div className={styles.leftCol}>
            {/* ── Cliente ── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleRow}>
                  <div
                    className={styles.cardIconWrap}
                    style={{ background: "#eff6ff" }}
                  >
                    <User size={15} color="#2563eb" />
                  </div>
                  <h2 className={styles.cardTitle}>Cliente</h2>
                </div>

                {!editingClient ? (
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => setEditingClient(true)}
                  >
                    <Edit2 size={13} />
                    Editar
                  </button>
                ) : (
                  <div className={styles.editActions}>
                    <button
                      type="button"
                      className={styles.cancelEditBtn}
                      onClick={cancelClientEdit}
                    >
                      <X size={13} />
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.saveEditBtn}
                      onClick={handleSaveClient}
                      disabled={savingClient}
                    >
                      {savingClient ? (
                        <Loader2 size={13} className={styles.spinIconSm} />
                      ) : (
                        <Check size={13} />
                      )}
                      Guardar
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.cardBody}>
                <div className={styles.clientHeader}>
                  <div className={styles.clientAvatar}>
                    {(
                      order.client.firstName[0] +
                      (order.client.lastName?.[0] ?? "")
                    ).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {!editingClient ? (
                      <>
                        <p className={styles.clientName}>
                          {order.client.firstName} {order.client.lastName}
                        </p>
                        <span className={styles.dniBadge}>
                          {order.client.dniType}: {order.client.dni}
                        </span>
                      </>
                    ) : (
                      <div className={styles.nameRow}>
                        <input
                          className={styles.input}
                          value={clientForm.firstName ?? ""}
                          onChange={(e) =>
                            setClientForm((p) => ({ ...p, firstName: e.target.value }))
                          }
                          placeholder="Nombre"
                        />
                        <input
                          className={styles.input}
                          value={clientForm.lastName ?? ""}
                          onChange={(e) =>
                            setClientForm((p) => ({ ...p, lastName: e.target.value }))
                          }
                          placeholder="Apellidos"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {!editingClient ? (
                  <>
                    <div className={styles.infoRows}>
                      {order.client.email && (
                        <div className={styles.infoRow}>
                          <Mail size={13} className={styles.infoIcon} />
                          <a href={`mailto:${order.client.email}`} className={styles.infoLink}>
                            {order.client.email}
                          </a>
                        </div>
                      )}
                      {order.client.phoneNumber && (
                        <div className={styles.infoRow}>
                          <Phone size={13} className={styles.infoIcon} />
                          <a href={`tel:${order.client.phoneNumber}`} className={styles.infoLink}>
                            {order.client.phoneNumber}
                          </a>
                        </div>
                      )}
                      {order.client.address && (
                        <div className={styles.infoRow}>
                          <MapPin size={13} className={styles.infoIcon} />
                          <span>
                            {order.client.address}
                            {order.client.city && `, ${order.client.city}`}
                            {order.client.postalCode && ` ${order.client.postalCode}`}
                          </span>
                        </div>
                      )}
                      {!order.client.email &&
                        !order.client.phoneNumber &&
                        !order.client.address && (
                          <p style={{ fontSize: "0.77rem", color: "var(--muted)", fontStyle: "italic" }}>
                            Sin datos de contacto registrados
                          </p>
                        )}
                    </div>
                    {(order.client.phoneNumber || order.client.email) && (
                      <div className={styles.contactActions}>
                        {order.client.phoneNumber && (
                          <a
                            href={`tel:${order.client.phoneNumber}`}
                            className={styles.contactBtn}
                          >
                            <Phone size={12} />
                            Llamar
                          </a>
                        )}
                        {order.client.phoneNumber && (
                          <a
                            href={`https://wa.me/${order.client.phoneNumber.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.contactBtnWa}
                          >
                            <ExternalLink size={12} />
                            WhatsApp
                          </a>
                        )}
                        {order.client.email && (
                          <a
                            href={`mailto:${order.client.email}`}
                            className={styles.contactBtn}
                          >
                            <Mail size={12} />
                            Email
                          </a>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.editFields}>
                    {/* ── Documento de identidad ── */}
                    <div className={styles.row2}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>
                          <Hash size={11} />
                          Tipo de documento
                        </label>
                        <select
                          className={styles.select}
                          value={clientForm.dniType ?? "NIF"}
                          onChange={(e) =>
                            setClientForm((p) => ({
                              ...p,
                              dniType: e.target.value as Client["dniType"],
                            }))
                          }
                        >
                          <option value="NIF">NIF</option>
                          <option value="NIE">NIE</option>
                          <option value="PASSPORT">Pasaporte</option>
                        </select>
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>
                          Número de documento
                        </label>
                        <input
                          className={styles.input}
                          value={clientForm.dni ?? ""}
                          onChange={(e) =>
                            setClientForm((p) => ({ ...p, dni: e.target.value }))
                          }
                          placeholder={
                            clientForm.dniType === "NIF"
                              ? "12345678Z"
                              : clientForm.dniType === "NIE"
                              ? "X1234567Z"
                              : "Número de pasaporte"
                          }
                          maxLength={20}
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>
                        <Mail size={11} />
                        Email
                      </label>
                      <input
                        type="email"
                        className={styles.input}
                        value={clientForm.email ?? ""}
                        onChange={(e) =>
                          setClientForm((p) => ({ ...p, email: e.target.value }))
                        }
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>
                        <Phone size={11} />
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        className={styles.input}
                        value={clientForm.phoneNumber ?? ""}
                        onChange={(e) =>
                          setClientForm((p) => ({ ...p, phoneNumber: e.target.value }))
                        }
                        placeholder="+34 600 000 000"
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>
                        <MapPin size={11} />
                        Dirección
                      </label>
                      <input
                        className={styles.input}
                        value={clientForm.address ?? ""}
                        onChange={(e) =>
                          setClientForm((p) => ({ ...p, address: e.target.value }))
                        }
                        placeholder="Calle, número…"
                      />
                    </div>
                    <div className={styles.row2}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>Cód. Postal</label>
                        <input
                          className={styles.input}
                          value={clientForm.postalCode ?? ""}
                          onChange={(e) =>
                            setClientForm((p) => ({ ...p, postalCode: e.target.value }))
                          }
                          placeholder="00000"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>Ciudad</label>
                        <input
                          className={styles.input}
                          value={clientForm.city ?? ""}
                          onChange={(e) =>
                            setClientForm((p) => ({ ...p, city: e.target.value }))
                          }
                          placeholder="Ciudad"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Dispositivo ── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleRow}>
                  <div
                    className={styles.cardIconWrap}
                    style={{ background: "#f0fdf4" }}
                  >
                    <Smartphone size={15} color="#16a34a" />
                  </div>
                  <h2 className={styles.cardTitle}>Dispositivo</h2>
                </div>

                {!editingDevice ? (
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => setEditingDevice(true)}
                  >
                    <Edit2 size={13} />
                    Editar
                  </button>
                ) : (
                  <div className={styles.editActions}>
                    <button
                      type="button"
                      className={styles.cancelEditBtn}
                      onClick={cancelDeviceEdit}
                    >
                      <X size={13} />
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.saveEditBtn}
                      onClick={handleSaveDevice}
                      disabled={savingDevice}
                    >
                      {savingDevice ? (
                        <Loader2 size={13} className={styles.spinIconSm} />
                      ) : (
                        <Check size={13} />
                      )}
                      Guardar
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.cardBody}>
                {!editingDevice ? (
                  <>
                    {!order.device ? (
                      <p style={{ fontSize: "0.77rem", color: "var(--muted)", fontStyle: "italic" }}>
                        Sin dispositivo asociado
                      </p>
                    ) : (
                    <>
                    <div className={styles.deviceHeader}>
                      <div className={styles.deviceIcon}>
                        <Smartphone size={20} color="#16a34a" />
                      </div>
                      <div>
                        <p className={styles.deviceName}>
                          {order.device.brand} {order.device.model}
                        </p>
                        <span className={styles.deviceType}>{order.device.type}</span>
                      </div>
                    </div>
                    <div className={styles.infoRows}>
                      {order.device.imei && (
                        <div className={styles.infoRow}>
                          <Hash size={13} className={styles.infoIcon} />
                          <span className={styles.monoText}>
                            IMEI: {order.device.imei}
                          </span>
                        </div>
                      )}
                      <div className={styles.infoRow}>
                        <Hash size={13} className={styles.infoIcon} />
                        <span className={styles.monoText}>
                          Inventario: {order.device.inventoryCode}
                        </span>
                      </div>
                      <UnlockSecretReveal
                        deviceId={order.device.id}
                        type={order.device.unlockSecretType}
                        className={`${styles.infoRow} ${styles.monoText}`}
                      />
                      {order.device.observations && (
                        <p className={styles.obsText}>{order.device.observations}</p>
                      )}
                    </div>
                    </>
                    )}
                  </>
                ) : (
                  <div className={styles.editFields}>
                    <div className={styles.row2}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>Marca</label>
                        <input
                          className={styles.input}
                          value={deviceForm.brand ?? ""}
                          onChange={(e) =>
                            setDeviceForm((p) => ({ ...p, brand: e.target.value }))
                          }
                          placeholder="Samsung, Apple…"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>Modelo</label>
                        <input
                          className={styles.input}
                          value={deviceForm.model ?? ""}
                          onChange={(e) =>
                            setDeviceForm((p) => ({ ...p, model: e.target.value }))
                          }
                          placeholder="Galaxy S21…"
                        />
                      </div>
                    </div>
                    <div className={styles.row2}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>Tipo</label>
                        <input
                          className={styles.input}
                          value={deviceForm.type ?? ""}
                          onChange={(e) =>
                            setDeviceForm((p) => ({ ...p, type: e.target.value }))
                          }
                          placeholder="smartphone, tablet…"
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label className={styles.label}>IMEI</label>
                        <input
                          className={styles.input}
                          value={deviceForm.imei ?? ""}
                          onChange={(e) =>
                            setDeviceForm((p) => ({ ...p, imei: e.target.value }))
                          }
                          placeholder="15 dígitos"
                          maxLength={15}
                        />
                      </div>
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>
                        <KeyRound size={11} />
                        Código / PIN (vacío = mantener el guardado)
                      </label>
                      <input
                        className={styles.input}
                        value={deviceForm.code ?? ""}
                        onChange={(e) =>
                          setDeviceForm((p) => ({
                            ...p,
                            code: e.target.value,
                            // limpiar patrón si se introduce código
                            ...(e.target.value ? { pattern: "" } : {}),
                          }))
                        }
                        placeholder="1234…"
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>
                        <Fingerprint size={11} />
                        Patrón de desbloqueo (vacío = mantener el guardado)
                      </label>
                      <PatternLock
                        value={deviceForm.pattern ?? ""}
                        onChange={(v) =>
                          setDeviceForm((p) => ({
                            ...p,
                            pattern: v,
                            // limpiar código si se dibuja patrón
                            ...(v ? { code: "" } : {}),
                          }))
                        }
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>
                        Observaciones del dispositivo
                      </label>
                      <textarea
                        className={styles.textarea}
                        value={deviceForm.observations ?? ""}
                        onChange={(e) =>
                          setDeviceForm((p) => ({ ...p, observations: e.target.value }))
                        }
                        rows={2}
                        placeholder="Pantalla rallada, sin cargador…"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Servicios ── */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleRow}>
                  <div
                    className={styles.cardIconWrap}
                    style={{ background: "#fff7ed" }}
                  >
                    <Wrench size={15} color="#ea6c0a" />
                  </div>
                  <h2 className={styles.cardTitle}>Servicios</h2>
                  {isSyncing && (
                    <span className={styles.syncBadge}>
                      <Loader2 size={10} className={styles.spinIconSm} />
                      Sincronizando…
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.addServiceBtn}
                  onClick={() => setShowServiceModal(true)}
                >
                  <Plus size={14} />
                  Agregar servicio
                </button>
              </div>

              <div className={styles.cardBody}>
                {selectedServices.length === 0 ? (
                  <div className={styles.emptyServices}>
                    <Wrench size={28} color="#c4cfe0" />
                    <p>Sin servicios agregados</p>
                    <button
                      type="button"
                      className={styles.btnLink}
                      onClick={() => setShowServiceModal(true)}
                    >
                      + Agregar primer servicio
                    </button>
                  </div>
                ) : (
                  <>
                    <div className={styles.serviceList}>
                      {selectedServices.map((svc) => (
                        <div key={svc.id} className={styles.serviceItem}>
                          <div className={styles.serviceMeta}>
                            <span className={styles.serviceName}>{svc.name}</span>
                            {svc.description && (
                              <span className={styles.serviceDesc}>
                                {svc.description}
                              </span>
                            )}
                            {svc.estimatedTime ? (
                              <span className={styles.serviceTime}>
                                <Clock size={10} />
                                {svc.estimatedTime}h estimadas
                              </span>
                            ) : null}
                          </div>
                          <div className={styles.serviceRight}>
                            <span className={styles.servicePrice}>
                              {fEur(svc.price)}
                            </span>
                            <button
                              type="button"
                              className={styles.removeServiceBtn}
                              onClick={() => handleRemoveService(svc.id)}
                              title="Eliminar servicio"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className={styles.serviceTotal}>
                      <span>Total servicios</span>
                      <strong className={styles.serviceTotalAmt}>
                        {fEur(selectedServices.reduce((a, s) => a + Number(s.price), 0))}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              RIGHT COLUMN (sidebar)
          ══════════════════════════════════════════════ */}
          <div className={styles.rightCol}>

            {/* ── Estado ── */}
            <div className={styles.card}>
              <button
                type="button"
                className={styles.cardHeaderToggle}
                onClick={() => toggleSection("status")}
              >
                <div className={styles.cardTitleRow}>
                  <div
                    className={styles.cardIconWrap}
                    style={{ background: "#eff6ff" }}
                  >
                    <Activity size={15} color="#2563eb" />
                  </div>
                  <h2 className={styles.cardTitle}>Estado</h2>
                  {!openSections.has("status") && (
                    <span
                      className={styles.cardSummaryBadge}
                      style={{
                        background: STATUS_CFG[formData.status].bg,
                        color: STATUS_CFG[formData.status].color,
                      }}
                    >
                      {STATUS_CFG[formData.status].label}
                    </span>
                  )}
                </div>
                <ChevronDown
                  size={15}
                  className={`${styles.chevron} ${openSections.has("status") ? styles.chevronOpen : ""}`}
                />
              </button>
              {openSections.has("status") && (
                <div className={styles.cardBody}>
                  <div className={styles.statusGrid}>
                    {([...STATUS_FLOW, "cancelado"] as OrderStatus[]).map((st) => {
                      const cfg = STATUS_CFG[st];
                      const active = formData.status === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          className={`${styles.statusBtn} ${active ? styles.statusBtnActive : ""}`}
                          style={
                            active
                              ? { background: cfg.bg, borderColor: cfg.color, color: cfg.color }
                              : st === "cancelado"
                                ? { borderColor: "rgba(220,38,38,0.3)", color: "#dc2626" }
                                : {}
                          }
                          onClick={() => setFormData((p) => ({ ...p, status: st }))}
                        >
                          {active && <Check size={11} />}
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Prioridad ── */}
            <div className={styles.card}>
              <button
                type="button"
                className={styles.cardHeaderToggle}
                onClick={() => toggleSection("priority")}
              >
                <div className={styles.cardTitleRow}>
                  <div
                    className={styles.cardIconWrap}
                    style={{ background: "#fff7ed" }}
                  >
                    <AlertTriangle size={15} color="#ea6c0a" />
                  </div>
                  <h2 className={styles.cardTitle}>Prioridad</h2>
                  {!openSections.has("priority") && (
                    <span
                      className={styles.cardSummaryBadge}
                      style={{
                        background: PRIORITY_CFG[formData.priority].bg,
                        color: PRIORITY_CFG[formData.priority].color,
                      }}
                    >
                      {PRIORITY_CFG[formData.priority].label}
                    </span>
                  )}
                </div>
                <ChevronDown
                  size={15}
                  className={`${styles.chevron} ${openSections.has("priority") ? styles.chevronOpen : ""}`}
                />
              </button>
              {openSections.has("priority") && (
                <div className={styles.cardBody}>
                  <div className={styles.priorityPills}>
                    {(
                      Object.entries(PRIORITY_CFG) as [
                        OrderPriority,
                        (typeof PRIORITY_CFG)[OrderPriority],
                      ][]
                    ).map(([key, cfg]) => {
                      const active = formData.priority === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`${styles.priorityPill} ${active ? styles.priorityPillActive : ""}`}
                          style={
                            active
                              ? { background: cfg.bg, borderColor: cfg.color, color: cfg.color }
                              : {}
                          }
                          onClick={() => setFormData((p) => ({ ...p, priority: key }))}
                        >
                          {active && <Check size={11} />}
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Técnico ── */}
            <div className={styles.card}>
              <button
                type="button"
                className={styles.cardHeaderToggle}
                onClick={() => toggleSection("tech")}
              >
                <div className={styles.cardTitleRow}>
                  <div
                    className={styles.cardIconWrap}
                    style={{ background: "#f3effe" }}
                  >
                    <User size={15} color="#7c3aed" />
                  </div>
                  <h2 className={styles.cardTitle}>Técnico</h2>
                  {!openSections.has("tech") && formData.assignedTo && (
                    <span
                      className={styles.cardSummaryBadge}
                      style={{ background: "#f3effe", color: "#7c3aed" }}
                    >
                      {formData.assignedTo}
                    </span>
                  )}
                </div>
                <ChevronDown
                  size={15}
                  className={`${styles.chevron} ${openSections.has("tech") ? styles.chevronOpen : ""}`}
                />
              </button>
              {openSections.has("tech") && (
                <div className={styles.cardBody}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>
                      <User size={11} />
                      Técnico responsable
                    </label>
                    <input
                      className={styles.input}
                      value={formData.assignedTo}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, assignedTo: e.target.value }))
                      }
                      placeholder="Nombre del técnico…"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Pago ── */}
            <div className={styles.card}>
              <button
                type="button"
                className={styles.cardHeaderToggle}
                onClick={() => toggleSection("payment")}
              >
                <div className={styles.cardTitleRow}>
                  <div
                    className={styles.cardIconWrap}
                    style={{ background: "#ecfdf5" }}
                  >
                    <CreditCard size={15} color="#059669" />
                  </div>
                  <h2 className={styles.cardTitle}>Pago</h2>
                  {!openSections.has("payment") && (
                    <span
                      className={styles.cardSummaryBadge}
                      style={{ background: "#ecfdf5", color: "#059669" }}
                    >
                      {fEur(formData.totalPrice)}
                    </span>
                  )}
                </div>
                <ChevronDown
                  size={15}
                  className={`${styles.chevron} ${openSections.has("payment") ? styles.chevronOpen : ""}`}
                />
              </button>
              {openSections.has("payment") && (
                <div className={styles.cardBody}>
                  {/* Resumen visual */}
                  <div className={styles.paymentSummary}>
                    <div className={styles.paymentRow}>
                      <span className={styles.paymentLabel}>Total</span>
                      <span className={styles.paymentTotal}>
                        {fEur(formData.totalPrice)}
                      </span>
                    </div>
                    <div className={styles.paymentRow}>
                      <span className={styles.paymentLabel}>Pagado</span>
                      <span className={styles.paymentPaid}>
                        {fEur(formData.amountPaid)}
                      </span>
                    </div>
                    <div className={styles.paymentBarWrap}>
                      <div
                        className={styles.paymentBar}
                        style={{
                          width: `${paymentPct}%`,
                          background:
                            paymentPct >= 100
                              ? "#059669"
                              : paymentPct > 0
                                ? "#d97706"
                                : "#e5e7eb",
                        }}
                      />
                    </div>
                    <div className={styles.paymentRow}>
                      <span className={styles.paymentLabel}>Pendiente</span>
                      <span
                        className={styles.paymentBalance}
                        style={{ color: balance > 0 ? "#dc2626" : "#059669" }}
                      >
                        {fEur(Math.max(balance, 0))}
                      </span>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className={styles.paymentInputs}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>Total (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={styles.input}
                        value={formData.totalPrice}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            totalPrice: parseFloat(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>Pagado (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={formData.totalPrice}
                        className={styles.input}
                        value={formData.amountPaid}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            amountPaid: parseFloat(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Método de pago */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Método de pago</label>
                    <div className={styles.methodPills}>
                      {(["cash", "card", "transfer"] as PaymentMethod[]).map(
                        (m) => (
                          <button
                            key={m}
                            type="button"
                            className={`${styles.methodPill} ${formData.paymentMethod === m ? styles.methodPillActive : ""}`}
                            onClick={() =>
                              setFormData((p) => ({ ...p, paymentMethod: m }))
                            }
                          >
                            {m === "cash" ? (
                              <Banknote size={12} />
                            ) : m === "card" ? (
                              <CreditCard size={12} />
                            ) : (
                              <ArrowRightLeft size={12} />
                            )}
                            {PAYMENT_METHOD_LABELS[m]}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Observaciones ── */}
            <div className={styles.card}>
              <button
                type="button"
                className={styles.cardHeaderToggle}
                onClick={() => toggleSection("obs")}
              >
                <div className={styles.cardTitleRow}>
                  <div
                    className={styles.cardIconWrap}
                    style={{ background: "#fefce8" }}
                  >
                    <FileText size={15} color="#ca8a04" />
                  </div>
                  <h2 className={styles.cardTitle}>Observaciones</h2>
                  {!openSections.has("obs") && formData.observations && (
                    <span
                      className={styles.cardSummaryBadge}
                      style={{ background: "#fefce8", color: "#ca8a04" }}
                    >
                      {formData.observations.length > 18
                        ? formData.observations.slice(0, 18) + "…"
                        : formData.observations}
                    </span>
                  )}
                </div>
                <ChevronDown
                  size={15}
                  className={`${styles.chevron} ${openSections.has("obs") ? styles.chevronOpen : ""}`}
                />
              </button>
              {openSections.has("obs") && (
                <div className={styles.cardBody}>
                  <textarea
                    className={styles.textarea}
                    value={formData.observations}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, observations: e.target.value }))
                    }
                    rows={4}
                    placeholder="Observaciones adicionales sobre la orden…"
                  />
                </div>
              )}
            </div>

            {/* ── Historial de trabajo ── */}
            {workHistory.length > 0 && (
              <div className={styles.card}>
                <button
                  type="button"
                  className={styles.cardHeaderToggle}
                  onClick={() => toggleSection("history")}
                >
                  <div className={styles.cardTitleRow}>
                    <div
                      className={styles.cardIconWrap}
                      style={{ background: "#eef1fe" }}
                    >
                      <ClipboardList size={15} color="#4f6ef7" />
                    </div>
                    <h2 className={styles.cardTitle}>Historial de trabajo</h2>
                    {!openSections.has("history") && (
                      <span
                        className={styles.cardSummaryBadge}
                        style={{ background: "#eef1fe", color: "#4f6ef7" }}
                      >
                        {workHistory.length} entrada{workHistory.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <ChevronDown
                    size={15}
                    className={`${styles.chevron} ${openSections.has("history") ? styles.chevronOpen : ""}`}
                  />
                </button>

                {openSections.has("history") && (
                  <div className={styles.cardBody}>
                    <div className={styles.historyList}>
                      {workHistory.map((entry, idx) => (
                        <div key={entry.id} className={styles.historyEntry}>
                          <div className={styles.historyEntryHeader}>
                            <span className={styles.historyAction}>
                              {entry.action}
                            </span>
                            <span className={styles.historyDate}>
                              {new Date(entry.performedAt).toLocaleDateString("es-ES", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <p className={styles.historyDesc}>{entry.description}</p>
                          {entry.partsReplaced && (
                            <div className={styles.historyParts}>
                              <Package size={11} style={{ flexShrink: 0, color: "#64748b" }} />
                              <span>{entry.partsReplaced}</span>
                            </div>
                          )}
                          {idx < workHistory.length - 1 && (
                            <div className={styles.historyDivider} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </form>

      {/* ══════════════════════════════════════════════
          MODAL — Agregar servicio existente
      ══════════════════════════════════════════════ */}
      {showServiceModal && (
        <div
          className={styles.modalOverlay}
          onClick={(e) =>
            e.target === e.currentTarget && setShowServiceModal(false)
          }
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Agregar servicio</h3>
              <button
                className={styles.modalClose}
                onClick={() => {
                  setShowServiceModal(false);
                  setSearchService("");
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.searchWrap}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder="Buscar servicio…"
                  value={searchService}
                  onChange={(e) => setSearchService(e.target.value)}
                  autoFocus
                />
              </div>

              <div className={styles.serviceModalList}>
                {filteredServices.length > 0 ? (
                  filteredServices.map((svc) => (
                    <button
                      key={svc.id}
                      type="button"
                      className={styles.serviceModalItem}
                      onClick={() => handleAddService(svc)}
                    >
                      <div className={styles.serviceModalMeta}>
                        <span className={styles.serviceName}>{svc.name}</span>
                        {svc.description && (
                          <span className={styles.serviceDesc}>
                            {svc.description}
                          </span>
                        )}
                        {svc.estimatedTime ? (
                          <span className={styles.serviceTime}>
                            <Clock size={10} />
                            {svc.estimatedTime}h
                          </span>
                        ) : null}
                      </div>
                      <span className={styles.serviceModalPrice}>
                        {fEur(svc.price)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyModal}>
                    <p>
                      {searchService
                        ? "Sin resultados para tu búsqueda"
                        : "No hay servicios disponibles"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnOutlineDashed}
                onClick={() => {
                  setShowServiceModal(false);
                  setShowCreateModal(true);
                }}
              >
                <Plus size={14} />
                Crear nuevo servicio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MODAL — Crear servicio nuevo
      ══════════════════════════════════════════════ */}
      {showCreateModal && (
        <div
          className={styles.modalOverlay}
          onClick={(e) =>
            e.target === e.currentTarget && setShowCreateModal(false)
          }
        >
          <div className={styles.modal} style={{ maxWidth: 440 }}>
            <div className={styles.modalHeader}>
              <h3>Crear nuevo servicio</h3>
              <button
                className={styles.modalClose}
                onClick={() => setShowCreateModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Nombre *</label>
                <input
                  className={styles.input}
                  value={newService.name}
                  onChange={(e) =>
                    setNewService((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Ej: Cambio de pantalla"
                  autoFocus
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Descripción</label>
                <textarea
                  className={styles.textarea}
                  value={newService.description}
                  onChange={(e) =>
                    setNewService((p) => ({ ...p, description: e.target.value }))
                  }
                  rows={2}
                  placeholder="Descripción del servicio…"
                />
              </div>
              <div className={styles.row2}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Precio (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={styles.input}
                    value={newService.price}
                    onChange={(e) =>
                      setNewService((p) => ({
                        ...p,
                        price: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Tiempo (h)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className={styles.input}
                    value={newService.estimatedTime}
                    onChange={(e) =>
                      setNewService((p) => ({
                        ...p,
                        estimatedTime: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowCreateModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!newService.name || newService.price <= 0}
                onClick={handleCreateService}
              >
                <Plus size={14} />
                Crear y agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
