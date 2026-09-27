"use client";
import React from "react";
import { ServiceStatus, Priority, VisibleColumns, StatusFilters, PriorityFilters } from "@/app/serviceOrders/types";
import styles from "./FilterPanel.module.css";

interface FilterPanelProps {
  visibleColumns: VisibleColumns;
  setVisibleColumns: React.Dispatch<React.SetStateAction<VisibleColumns>>;
  statusFilters: StatusFilters;
  setStatusFilters: React.Dispatch<React.SetStateAction<StatusFilters>>;
  priorityFilters: PriorityFilters;
  setPriorityFilters: React.Dispatch<React.SetStateAction<PriorityFilters>>;
}

const COLUMN_OPTIONS: { key: string; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "client", label: "Cliente" },
  { key: "device", label: "Dispositivo" },
  { key: "services", label: "Servicios" },
  { key: "priority", label: "Prioridad" },
  { key: "status", label: "Estado" },
  { key: "payment", label: "Pago" },
  { key: "financial", label: "Financiero" },
  { key: "city", label: "Ciudad" },
  { key: "dates", label: "Fechas" },
];

const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: ServiceStatus.PENDIENTE_CLIENTE, label: "Pendiente Cliente" },
  { key: ServiceStatus.EN_PROGRESO, label: "En Progreso" },
  { key: ServiceStatus.PENDIENTE_PIEZAS, label: "Pend. Piezas" },
  { key: ServiceStatus.FINALIZADO, label: "Finalizado" },
  { key: ServiceStatus.ENTREGADO, label: "Entregado" },
  { key: ServiceStatus.CANCELADO, label: "Cancelado" },
];

const PRIORITY_OPTIONS: { key: string; label: string }[] = [
  { key: Priority.LOW, label: "Baja" },
  { key: Priority.MEDIUM, label: "Media" },
  { key: Priority.HIGH, label: "Alta" },
  { key: Priority.URGENT, label: "Urgente" },
];

export function FilterPanel({
  visibleColumns,
  setVisibleColumns,
  statusFilters,
  setStatusFilters,
  priorityFilters,
  setPriorityFilters,
}: FilterPanelProps) {
  const resetAllColumns = () =>
    setVisibleColumns(Object.fromEntries(Object.keys(visibleColumns).map((k) => [k, true])));

  const resetAllStatus = () =>
    setStatusFilters(Object.fromEntries(Object.keys(statusFilters).map((k) => [k, true])));

  const resetAllPriority = () =>
    setPriorityFilters(Object.fromEntries(Object.keys(priorityFilters).map((k) => [k, true])));

  return (
    <div className={styles.filterPanel}>
      <div className={styles.filterSection}>
        <div className={styles.filterSectionHeader}>
          <span>Columnas visibles</span>
          <button className={styles.filterResetBtn} onClick={resetAllColumns}>
            Todas
          </button>
        </div>
        {COLUMN_OPTIONS.map(({ key, label }) => (
          <label key={key} className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={visibleColumns[key]}
              onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={styles.filterCheck}
            />
            {label}
          </label>
        ))}
      </div>

      <div className={styles.filterDivider} />

      <div className={styles.filterSection}>
        <div className={styles.filterSectionHeader}>
          <span>Filtrar por estado</span>
          <button className={styles.filterResetBtn} onClick={resetAllStatus}>
            Todos
          </button>
        </div>
        {STATUS_OPTIONS.map(({ key, label }) => (
          <label key={key} className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={statusFilters[key]}
              onChange={() => setStatusFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={styles.filterCheck}
            />
            {label}
          </label>
        ))}
      </div>

      <div className={styles.filterDivider} />

      <div className={styles.filterSection}>
        <div className={styles.filterSectionHeader}>
          <span>Filtrar por prioridad</span>
          <button className={styles.filterResetBtn} onClick={resetAllPriority}>
            Todas
          </button>
        </div>
        {PRIORITY_OPTIONS.map(({ key, label }) => (
          <label key={key} className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={priorityFilters[key]}
              onChange={() => setPriorityFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={styles.filterCheck}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
