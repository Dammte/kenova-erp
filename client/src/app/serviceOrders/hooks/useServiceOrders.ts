"use client";

import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { showToast } from "nextjs-toast-notify";
import {
  ServiceOrder,
  ServiceStatus,
  InventoryItem,
  FinalizationData,
} from "../types";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "../constants";
import { formatDate, formatCurrency } from "../utils/format";

const API = API_URL;

const FIELD_LABELS: Record<string, string> = {
  status: "Estado",
  priority: "Prioridad",
  "client.city": "Ciudad",
};

export function useServiceOrders() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [showNotesModal, setShowNotesModal] = useState<string | null>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState<string | null>(null);
  const [showPaymentCard, setShowPaymentCard] = useState<string | null>(null);
  const [showFinalizationCard, setShowFinalizationCard] = useState<string | null>(null);
  // Pending delete id — replaces native confirm()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const fetchNoteCount = useCallback(async (orderId: string) => {
    try {
      const res = await apiFetch(`${API}/service-orders/${orderId}/sticky-notes`);
      if (res.ok) {
        const notes = await res.json();
        setNoteCounts((prev) => ({ ...prev, [orderId]: notes.length }));
      }
    } catch {
      // Note counts are non-critical — suppress errors silently
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`${API}/service-orders`);
      if (!res.ok) throw new Error(`Error ${res.status}: no se pudo cargar las órdenes`);
      const data: ServiceOrder[] = await res.json();
      setOrders(data);
      // Fetch note counts in parallel — non-blocking
      void Promise.all(data.map((o) => fetchNoteCount(o.id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar las órdenes";
      setError(msg);
      showToast.error(msg, { duration: 4000, progress: true, position: "top-right", transition: "fadeIn" });
    } finally {
      setLoading(false);
    }
  }, [fetchNoteCount]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  const fetchInventory = async () => {
    try {
      setLoadingInventory(true);
      const res = await apiFetch(`${API}/inventory`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: InventoryItem[] = await res.json();
      setInventoryItems(data.filter((item) => item.stock > 0));
    } catch (err) {
      console.error("Error fetching inventory:", err);
      showToast.error("Error al cargar el inventario", { duration: 4000, progress: true, position: "top-right", transition: "fadeIn" });
    } finally {
      setLoadingInventory(false);
    }
  };

  const updateOrderField = async (
    orderId: string,
    field: string,
    value: string,
    closeEditing?: () => void,
  ) => {
    try {
      if (field === "status" && value === ServiceStatus.FINALIZADO) {
        await fetchInventory();
        setShowFinalizationCard(orderId);
        closeEditing?.();
        return;
      }

      if (field.startsWith("client.")) {
        const [, clientField] = field.split(".");
        const order = orders.find((o) => o.id === orderId);
        if (!order?.client?.id) throw new Error("No se pudo encontrar el cliente de la orden");

        const res = await apiFetch(`${API}/clients/${order.client.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [clientField]: value }),
        });
        if (!res.ok) throw new Error(`Error al actualizar cliente: ${res.status}`);

        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, client: { ...o.client, [clientField]: value } } : o,
          ),
        );
        closeEditing?.();
        showToast.success(`${FIELD_LABELS[field] ?? field} actualizado`, {
          duration: 3000, progress: true, position: "top-right", transition: "fadeIn",
        });
        return;
      }

      const res = await apiFetch(`${API}/service-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, [field]: value } : o)),
      );
      closeEditing?.();
      showToast.success(`${FIELD_LABELS[field] ?? field} actualizado`, {
        duration: 2500, progress: true, position: "top-right", transition: "fadeIn",
      });
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : `Error al actualizar ${field}`,
        { duration: 4000, progress: true, position: "top-right", transition: "fadeIn" },
      );
    }
  };

  const updateOrderPayment = async (orderId: string, paymentData: object) => {
    try {
      const res = await apiFetch(`${API}/service-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentData),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...paymentData } : o)),
      );
    } catch (err) {
      showToast.error(
        "Error al actualizar la información de pago. Por favor, intente nuevamente.",
        { duration: 4000, progress: true, position: "top-right", transition: "fadeIn" },
      );
    }
  };

  const finalizeOrderWithParts = async (
    orderId: string,
    finalizationData: FinalizationData,
  ): Promise<void> => {
    try {
      setLoading(true);

      // 1. Descontar piezas en el servidor: una sola operación atómica que falla
      //    entera si falta stock de alguna (nunca deja el stock en negativo).
      if (finalizationData.usedParts.length > 0) {
        const res = await apiFetch(`${API}/service-orders/${orderId}/consume-parts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: finalizationData.usedParts.map((part) => ({
              inventoryId: part.id,
              quantity: part.stock,
            })),
          }),
        });
        if (!res.ok) throw new Error(await errorMessage(res, "No se pudo descontar el stock"));
      }

      // 2. Marcar la orden como finalizada
      const res = await apiFetch(`${API}/service-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: ServiceStatus.FINALIZADO }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Error al finalizar la orden"));

      // 3. Guardar historial de trabajo si el técnico escribió notas
      if (finalizationData.workNotes) {
        const partsDescription =
          finalizationData.usedParts.length > 0
            ? finalizationData.usedParts.map((p) => `${p.name} x${p.stock}`).join(", ")
            : undefined;

        await apiFetch(`${API}/service-history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceOrderId: orderId,
            action: "Finalización",
            description: finalizationData.workNotes,
            ...(partsDescription && { partsReplaced: partsDescription }),
            ...(finalizationData.totalPartsCost > 0 && {
              partsCost: finalizationData.totalPartsCost,
            }),
          }),
        });
        // El historial es secundario — no bloqueamos la UI si falla
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: ServiceStatus.FINALIZADO } : o,
        ),
      );
      setShowFinalizationCard(null);
      showToast.success("Orden finalizada correctamente", {
        duration: 4000, progress: true, position: "top-right", transition: "fadeIn",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ocurrió un error desconocido";
      showToast.error(`Error al finalizar la orden: ${msg}`, {
        duration: 4000, progress: true, position: "top-right", transition: "fadeIn",
      });
    } finally {
      setLoading(false);
    }
  };

  // Opens confirm dialog — actual delete is in confirmDelete()
  const handleDeleteOrder = (orderId: string) => {
    setPendingDeleteId(orderId);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      setLoading(true);
      const res = await apiFetch(`${API}/service-orders/${id}`, { method: "DELETE" });
      if (res.status === 403) throw new Error("Solo un super administrador puede eliminar órdenes");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setOrders((prev) => prev.filter((o) => o.id !== id));
      showToast.success("Orden eliminada correctamente", {
        duration: 3000, progress: true, position: "top-right", transition: "fadeIn",
      });
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Error al eliminar la orden. Por favor, intente nuevamente.", {
        duration: 4000, progress: true, position: "top-right", transition: "fadeIn",
      });
    } finally {
      setLoading(false);
    }
  };

  const cancelDelete = () => setPendingDeleteId(null);

  const exportToExcel = (ordersToExport: ServiceOrder[]) => {
    try {
      const worksheet = XLSX.utils.json_to_sheet(
        ordersToExport.map((order) => ({
          ID: order.id,
          Nombre: `${order.client?.firstName} ${order.client?.lastName ?? ""}`,
          Teléfono: order.client?.phoneNumber ?? "N/A",
          Email: order.client?.email ?? "N/A",
          Ciudad: order.client?.city ?? "Sin ciudad",
          Marca: order.device?.brand ?? "N/A",
          Modelo: order.device?.model ?? "N/A",
          "Cód. Inventario": order.device?.inventoryCode ?? "N/A",
          Prioridad: PRIORITY_LABELS[order.priority] ?? order.priority,
          Estado: STATUS_LABELS[order.status] ?? order.status,
          "Estado de Pago": PAYMENT_STATUS_LABELS[order.paymentStatus ?? ""] ?? order.paymentStatus ?? "N/A",
          "Método de Pago": PAYMENT_METHOD_LABELS[order.paymentMethod ?? ""] ?? order.paymentMethod ?? "N/A",
          "Precio Total": order.totalPrice != null ? formatCurrency(order.totalPrice) : "N/A",
          "Monto Pagado": order.amountPaid != null ? formatCurrency(order.amountPaid) : "N/A",
          "Saldo Pendiente": order.balance != null ? formatCurrency(order.balance) : "N/A",
          Servicios: order.services?.map((s) => s.name ?? s.description).join(", ") ?? "N/A",
          "Técnico": order.assignedTo ?? "Sin asignar",
          "Fecha de Creación": formatDate(order.createdAt),
          "Última Actualización": formatDate(order.updatedAt),
        })),
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Órdenes de Servicio");
      XLSX.writeFile(workbook, `Ordenes_${new Date().toISOString().split("T")[0]}.xlsx`);

      showToast.success("Archivo Excel exportado exitosamente", {
        duration: 3000, progress: true, position: "top-right", transition: "fadeIn",
      });
    } catch (err) {
      showToast.error("Error al exportar a Excel.", {
        duration: 4000, progress: true, position: "top-right", transition: "fadeIn",
      });
    }
  };

  return {
    orders,
    loading,
    error,
    fetchOrders,
    inventoryItems,
    loadingInventory,
    fetchInventory,
    noteCounts,
    fetchNoteCount,
    showNotesModal,
    setShowNotesModal,
    showWhatsAppModal,
    setShowWhatsAppModal,
    showPaymentCard,
    setShowPaymentCard,
    showFinalizationCard,
    setShowFinalizationCard,
    pendingDeleteId,
    handleDeleteOrder,
    confirmDelete,
    cancelDelete,
    updateOrderField,
    updateOrderPayment,
    finalizeOrderWithParts,
    exportToExcel,
  };
}
