"use client";
import { useState, useEffect, useRef } from "react";
import {
  ServiceOrder,
  ServiceStatus,
  Priority,
  SortConfig,
  EditingCell,
  VisibleColumns,
  StatusFilters,
  PriorityFilters,
} from "../types";
import styles from "../page.module.css";

const PRIORITY_ORDER: Record<string, number> = {
  [Priority.LOW]: 0,
  [Priority.MEDIUM]: 1,
  [Priority.HIGH]: 2,
  [Priority.URGENT]: 3,
};

const STATUS_ORDER: Record<string, number> = {
  [ServiceStatus.EN_PROGRESO]: 0,
  [ServiceStatus.PENDIENTE_CLIENTE]: 1,
  [ServiceStatus.PENDIENTE_PIEZAS]: 2,
  [ServiceStatus.FINALIZADO]: 3,
  [ServiceStatus.ENTREGADO]: 4,
  [ServiceStatus.CANCELADO]: 5,
};

export function useTableConfig(orders: ServiceOrder[]) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    id: true,
    client: true,
    device: true,
    services: true,
    priority: true,
    status: true,
    payment: true,
    financial: true,
    city: true,
    dates: true,
  });

  const [statusFilters, setStatusFilters] = useState<StatusFilters>({
    [ServiceStatus.PENDIENTE_CLIENTE]: true,
    [ServiceStatus.EN_PROGRESO]: true,
    [ServiceStatus.PENDIENTE_PIEZAS]: true,
    [ServiceStatus.FINALIZADO]: true,
    [ServiceStatus.ENTREGADO]: true,
    [ServiceStatus.CANCELADO]: true,
  });

  const [priorityFilters, setPriorityFilters] = useState<PriorityFilters>({
    [Priority.LOW]: true,
    [Priority.MEDIUM]: true,
    [Priority.HIGH]: true,
    [Priority.URGENT]: true,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
        setShowFilterPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  const filteredOrders = orders.filter((order) => {
    const search = searchTerm.toLowerCase().trim();
    // For phone matching strip non-digits from both sides
    const searchDigits = search.replace(/\D/g, "");
    const matchesSearch =
      !search ||
      order.id?.toLowerCase().includes(search) ||
      `${order.client?.firstName} ${order.client?.lastName ?? ""}`
        .toLowerCase()
        .includes(search) ||
      order.device?.model?.toLowerCase().includes(search) ||
      order.device?.brand?.toLowerCase().includes(search) ||
      order.status?.toLowerCase().includes(search) ||
      (order.assignedTo?.toLowerCase() ?? "").includes(search) ||
      // Phone: compare digit-only strings so spaces/dashes don't block a match
      (searchDigits.length >= 3 &&
        (order.client?.phoneNumber ?? "").replace(/\D/g, "").includes(searchDigits));

    let matchesTab = true;
    switch (activeTab) {
      case "pending-client":
        matchesTab = order.status === ServiceStatus.PENDIENTE_CLIENTE;
        break;
      case "in-progress":
        matchesTab = order.status === ServiceStatus.EN_PROGRESO;
        break;
      case "pending-pieces":
        matchesTab = order.status === ServiceStatus.PENDIENTE_PIEZAS;
        break;
      case "delivery":
        matchesTab = order.status === ServiceStatus.FINALIZADO;
        break;
      case "completed":
        matchesTab = order.status === ServiceStatus.ENTREGADO;
        break;
      case "canceled":
        matchesTab = order.status === ServiceStatus.CANCELADO;
        break;
      default:
        matchesTab = true;
    }

    const matchesStatusFilter = statusFilters[order.status] !== false;
    const matchesPriorityFilter = priorityFilters[order.priority] !== false;

    return matchesSearch && matchesTab && matchesStatusFilter && matchesPriorityFilter;
  });

  const sortedOrders = sortConfig
    ? [...filteredOrders].sort((a, b) => {
        const dir = sortConfig.direction === "asc" ? 1 : -1;
        switch (sortConfig.field) {
          case "id":
            return dir * a.id.localeCompare(b.id);
          case "clientName":
            return dir * `${a.client.firstName} ${a.client.lastName ?? ""}`.localeCompare(
              `${b.client.firstName} ${b.client.lastName ?? ""}`,
            );
          case "device":
            return dir * `${a.device?.brand ?? ""} ${a.device?.model ?? ""}`.localeCompare(
              `${b.device?.brand ?? ""} ${b.device?.model ?? ""}`,
            );
          case "services":
            return dir * ((a.services?.length ?? 0) - (b.services?.length ?? 0));
          case "priority":
            return dir * ((PRIORITY_ORDER[a.priority] ?? 0) - (PRIORITY_ORDER[b.priority] ?? 0));
          case "status":
            return dir * ((STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));
          case "paymentStatus":
            return dir * (a.paymentStatus ?? "").localeCompare(b.paymentStatus ?? "");
          case "totalPrice":
            return dir * ((a.totalPrice ?? 0) - (b.totalPrice ?? 0));
          case "city":
            return dir * (a.client.city ?? "").localeCompare(b.client.city ?? "");
          case "createdAt":
            return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          default:
            return 0;
        }
      })
    : filteredOrders;

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentOrders = sortedOrders.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
  const visibleColumnCount = 1 + Object.values(visibleColumns).filter(Boolean).length;

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    document.querySelector(`.${styles.tableContainer}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleSort = (field: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.field !== field) return { field, direction: "asc" };
      if (prev.direction === "asc") return { field, direction: "desc" };
      return null;
    });
  };

  const getSortIcon = (field: string): React.ReactElement => {
    if (!sortConfig || sortConfig.field !== field) {
      return <span className={styles.sortIcon}>⇅</span>;
    }
    return (
      <span className={`${styles.sortIcon} ${styles.sortIconActive}`}>
        {sortConfig.direction === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  // Count helpers for tab badges
  const countByStatus = (status: ServiceStatus) =>
    orders.filter((o) => o.status === status).length;

  const tabCounts: Record<string, number> = {
    all: orders.length,
    "in-progress": countByStatus(ServiceStatus.EN_PROGRESO),
    "pending-client": countByStatus(ServiceStatus.PENDIENTE_CLIENTE),
    "pending-pieces": countByStatus(ServiceStatus.PENDIENTE_PIEZAS),
    delivery: countByStatus(ServiceStatus.FINALIZADO),
    completed: countByStatus(ServiceStatus.ENTREGADO),
    canceled: countByStatus(ServiceStatus.CANCELADO),
  };

  const isAnyFilterActive =
    Object.values(statusFilters).some((v) => !v) ||
    Object.values(priorityFilters).some((v) => !v);

  const openEditing = (field: string, orderId: string) =>
    setEditingCell({ field, orderId });

  const closeEditing = () => setEditingCell(null);

  return {
    searchTerm,
    setSearchTerm,
    activeTab,
    setActiveTab,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    editingCell,
    openEditing,
    closeEditing,
    showFilterPanel,
    setShowFilterPanel,
    filterPanelRef,
    visibleColumns,
    setVisibleColumns,
    statusFilters,
    setStatusFilters,
    priorityFilters,
    setPriorityFilters,
    sortConfig,
    setSortConfig,
    filteredOrders,
    sortedOrders,
    currentOrders,
    totalPages,
    visibleColumnCount,
    indexOfFirstItem,
    indexOfLastItem,
    handleSort,
    getSortIcon,
    tabCounts,
    isAnyFilterActive,
    paginate,
  };
}
