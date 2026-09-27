"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Trash2,
  Edit2,
  Plus,
  AlertCircle,
  Loader2,
  Search,
  Clock,
  Tag,
  Wrench,
  X,
  CheckCircle2,
  XCircle,
  SlidersHorizontal,
  LayoutGrid,
  List,
} from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { showToast } from "nextjs-toast-notify";

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  estimatedTime?: string;
  category?: string;
  available: boolean;
  createdAt: string;
  updatedAt: string;
}

type SortKey = "name_asc" | "name_desc" | "price_asc" | "price_desc";
type FilterStatus = "all" | "available" | "unavailable";

const fEur = (v: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);

const AVATAR_PALETTE = [
  "#4f6ef7", "#ea6c0a", "#059669", "#7c3aed",
  "#2563eb", "#dc2626", "#d97706",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/services`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setServices(await res.json());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error al cargar los servicios"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (id: string) => {
    setDeleteLoading(id);
    try {
      const res = await apiFetch(`${API_URL}/services/${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setServices((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirmId(null);
      showToast.success("Servicio eliminado", {
        duration: 3000,
        position: "top-right",
      });
    } catch {
      showToast.error("No se pudo eliminar el servicio", {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setDeleteLoading(null);
    }
  };

  const counts = useMemo(
    () => ({
      all: services.length,
      available: services.filter((s) => s.available).length,
      unavailable: services.filter((s) => !s.available).length,
    }),
    [services]
  );

  const filtered = useMemo(() => {
    let result = [...services];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.category?.toLowerCase().includes(q)
      );
    }

    if (filterStatus === "available") result = result.filter((s) => s.available);
    if (filterStatus === "unavailable") result = result.filter((s) => !s.available);

    result.sort((a, b) => {
      switch (sortKey) {
        case "name_asc":   return a.name.localeCompare(b.name);
        case "name_desc":  return b.name.localeCompare(a.name);
        case "price_asc":  return a.price - b.price;
        case "price_desc": return b.price - a.price;
        default:           return 0;
      }
    });

    return result;
  }, [services, searchQuery, filterStatus, sortKey]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.centerScreen}>
        <Loader2 className={styles.spinIcon} size={32} />
        <span>Cargando servicios…</span>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.centerScreen}>
        <div className={styles.errorCard}>
          <AlertCircle size={28} color="#dc2626" />
          <h2>Error al cargar</h2>
          <p>{error}</p>
          <button
            className={styles.btnPrimary}
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>

      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Servicios</h1>
          <p className={styles.pageSubtitle}>
            {services.length} servicio{services.length !== 1 ? "s" : ""} registrado
            {services.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/services/new-services" className={styles.btnPrimary}>
          <Plus size={16} />
          Nuevo servicio
        </Link>
      </div>

      {/* ── TOOLBAR ── */}
      <div className={styles.toolbar}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Buscar por nombre, descripción o categoría…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles.searchClear}
              onClick={() => setSearchQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className={styles.filters}>
          {(
            [
              { key: "all",         label: `Todos (${counts.all})` },
              { key: "available",   label: `Activos (${counts.available})` },
              { key: "unavailable", label: `Inactivos (${counts.unavailable})` },
            ] as { key: FilterStatus; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              className={`${styles.filterPill} ${filterStatus === key ? styles.filterPillActive : ""}`}
              onClick={() => setFilterStatus(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className={styles.sortWrap}>
          <SlidersHorizontal size={13} className={styles.sortIcon} />
          <select
            className={styles.sortSelect}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="name_asc">Nombre A→Z</option>
            <option value="name_desc">Nombre Z→A</option>
            <option value="price_asc">Precio ↑</option>
            <option value="price_desc">Precio ↓</option>
          </select>
        </div>

        {/* View toggle */}
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${viewMode === "grid" ? styles.viewBtnActive : ""}`}
            onClick={() => setViewMode("grid")}
            title="Vista en tarjetas"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            className={`${styles.viewBtn} ${viewMode === "list" ? styles.viewBtnActive : ""}`}
            onClick={() => setViewMode("list")}
            title="Vista en lista"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* ── EMPTY: no services at all ── */}
      {services.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Wrench size={30} color="#c4cfe0" />
          </div>
          <h3 className={styles.emptyTitle}>Sin servicios registrados</h3>
          <p className={styles.emptyText}>
            Comienza agregando tu primer servicio para poder asignarlo a
            órdenes de trabajo.
          </p>
          <Link href="/services/new-services" className={styles.btnPrimary}>
            <Plus size={15} />
            Agregar primer servicio
          </Link>
        </div>
      )}

      {/* ── EMPTY: search returned nothing ── */}
      {services.length > 0 && filtered.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Search size={28} color="#c4cfe0" />
          </div>
          <h3 className={styles.emptyTitle}>Sin resultados</h3>
          <p className={styles.emptyText}>
            No se encontraron servicios que coincidan con los filtros
            actuales.
          </p>
          <button
            className={styles.btnSecondary}
            onClick={() => {
              setSearchQuery("");
              setFilterStatus("all");
            }}
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* ── GRID / LIST ── */}
      {filtered.length > 0 && viewMode === "list" && (
        <div className={styles.listView}>
          {/* List header */}
          <div className={styles.listHeader}>
            <span className={styles.listColName}>Servicio</span>
            <span className={styles.listColStatus}>Estado</span>
            <span className={styles.listColPrice}>Precio</span>
            <span className={styles.listColTime}>Tiempo</span>
            <span className={styles.listColActions} />
          </div>

          {filtered.map((service) => {
            const color = avatarColor(service.name);
            const isConfirming = deleteConfirmId === service.id;
            return (
              <div
                key={service.id}
                className={`${styles.listRow} ${isConfirming ? styles.listRowConfirm : ""}`}
                style={{ borderLeftColor: color }}
              >
                {isConfirming ? (
                  <div className={styles.listConfirm}>
                    <Trash2 size={15} color="#dc2626" />
                    <span className={styles.confirmText}>
                      ¿Eliminar <strong>{service.name}</strong>?
                    </span>
                    <div className={styles.confirmActions}>
                      <button
                        className={styles.btnCancelConfirm}
                        onClick={() => setDeleteConfirmId(null)}
                        disabled={!!deleteLoading}
                      >
                        Cancelar
                      </button>
                      <button
                        className={styles.btnDeleteConfirm}
                        onClick={() => handleDelete(service.id)}
                        disabled={!!deleteLoading}
                      >
                        {deleteLoading === service.id ? (
                          <Loader2 size={13} className={styles.spinIconSm} />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        Eliminar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Name + category */}
                    <div className={styles.listColName}>
                      <div
                        className={styles.listAvatar}
                        style={{ background: `${color}18`, color }}
                      >
                        {service.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={styles.listNameBlock}>
                        <span className={styles.listName}>{service.name}</span>
                        {service.category && (
                          <span className={styles.categoryBadge}>
                            <Tag size={10} />
                            {service.category}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className={styles.listColStatus}>
                      <span
                        className={`${styles.statusBadge} ${
                          service.available
                            ? styles.statusAvailable
                            : styles.statusUnavailable
                        }`}
                      >
                        {service.available ? (
                          <CheckCircle2 size={11} />
                        ) : (
                          <XCircle size={11} />
                        )}
                        {service.available ? "Activo" : "Inactivo"}
                      </span>
                    </div>

                    {/* Price */}
                    <div className={styles.listColPrice}>
                      <span className={styles.listPrice} style={{ color }}>
                        {fEur(service.price)}
                      </span>
                    </div>

                    {/* Time */}
                    <div className={styles.listColTime}>
                      {service.estimatedTime ? (
                        <span className={styles.metaChip}>
                          <Clock size={12} />
                          {service.estimatedTime}h
                        </span>
                      ) : (
                        <span className={styles.listEmpty}>—</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className={styles.listColActions}>
                      <button
                        className={styles.editBtn}
                        onClick={() => router.push(`/services/edit/${service.id}`)}
                      >
                        <Edit2 size={14} />
                        Editar
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => setDeleteConfirmId(service.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && viewMode === "grid" && (
        <div className={styles.grid}>
          {filtered.map((service) => {
            const color = avatarColor(service.name);
            const isConfirming = deleteConfirmId === service.id;

            return (
              <div
                key={service.id}
                className={`${styles.card} ${isConfirming ? styles.cardConfirm : ""}`}
              >
                {isConfirming ? (
                  /* ── Delete confirmation ── */
                  <div className={styles.confirmOverlay}>
                    <div className={styles.confirmIconWrap}>
                      <Trash2 size={20} color="#dc2626" />
                    </div>
                    <p className={styles.confirmText}>
                      ¿Eliminar <strong>{service.name}</strong>?
                    </p>
                    <p className={styles.confirmSub}>
                      Esta acción no se puede deshacer.
                    </p>
                    <div className={styles.confirmActions}>
                      <button
                        className={styles.btnCancelConfirm}
                        onClick={() => setDeleteConfirmId(null)}
                        disabled={!!deleteLoading}
                      >
                        Cancelar
                      </button>
                      <button
                        className={styles.btnDeleteConfirm}
                        onClick={() => handleDelete(service.id)}
                        disabled={!!deleteLoading}
                      >
                        {deleteLoading === service.id ? (
                          <Loader2 size={13} className={styles.spinIconSm} />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        Eliminar
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal card ── */
                  <>
                    {/* Top */}
                    <div
                      className={styles.cardTop}
                      style={{ borderTopColor: color }}
                    >
                      <div
                        className={styles.cardAvatar}
                        style={{ background: `${color}18`, color }}
                      >
                        {service.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={styles.cardTitleArea} data-tooltip={service.name}>
                        <h2 className={styles.cardTitle}><span>{service.name}</span></h2>
                        {service.category && (
                          <span className={styles.categoryBadge}>
                            <Tag size={10} />
                            {service.category}
                          </span>
                        )}
                      </div>
                      <span
                        className={`${styles.statusBadge} ${
                          service.available
                            ? styles.statusAvailable
                            : styles.statusUnavailable
                        }`}
                      >
                        {service.available ? (
                          <CheckCircle2 size={11} />
                        ) : (
                          <XCircle size={11} />
                        )}
                        {service.available ? "Activo" : "Inactivo"}
                      </span>
                    </div>

                    {/* Body */}
                    <div className={styles.cardBody}>
                      {service.description ? (
                        <p className={styles.cardDesc}>{service.description}</p>
                      ) : (
                        <p className={styles.cardDescEmpty}>Sin descripción</p>
                      )}

                      <div className={styles.cardMeta}>
                        <div className={styles.priceBlock}>
                          <span className={styles.priceLabel}>Precio</span>
                          <span
                            className={styles.priceValue}
                            style={{ color }}
                          >
                            {fEur(service.price)}
                          </span>
                        </div>
                        {service.estimatedTime && (
                          <div className={styles.metaChip}>
                            <Clock size={12} />
                            {service.estimatedTime}h
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className={styles.cardFooter}>
                      <button
                        className={styles.editBtn}
                        onClick={() =>
                          router.push(`/services/edit/${service.id}`)
                        }
                      >
                        <Edit2 size={14} />
                        Editar
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => setDeleteConfirmId(service.id)}
                      >
                        <Trash2 size={14} />
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
