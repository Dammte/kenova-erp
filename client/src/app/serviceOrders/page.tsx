"use client";
import { useState } from "react";
import {
  Plus,
  Edit,
  Trash2,
  Download,
  Filter,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Mail,
  Phone,
  Wrench,
  MoreVertical,
  FileText,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Ticket,
  StickyNote,
  MapPin,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NotesModal } from "@/components/serviceOrders/notesModal/notesModal";
import styles from "./page.module.css";
import PaymentEditCard from "@/components/serviceOrders/paymentEditCard/paymentEditCard";
import { WhatsAppModal } from "./whatsappMessage/Whatsappmodal";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "./constants";
import { ServiceStatus, Priority } from "./types";
import {
  formatDate,
  formatCurrency,
  getStatusClass,
  getPriorityClass,
  getPaymentStatusClass,
} from "./utils/format";
import { getStatusIcon, getPaymentStatusIcon } from "./utils/icons";
import { printOrderPDF, printOrderTicket } from "./utils/print";
import { useServiceOrders } from "./hooks/useServiceOrders";
import { useTableConfig } from "./hooks/useTableConfig";
import { DropdownMenu } from "@/components/serviceOrders/DropdownMenu";
import { EditableDropdown } from "@/components/serviceOrders/EditableDropdown";
import { FinalizationCard } from "@/components/serviceOrders/FinalizationCard";
import { FilterPanel } from "@/components/serviceOrders/FilterPanel";
import { ClientHistoryModal } from "@/components/serviceOrders/ClientHistoryModal";

// ── Constants ──────────────────────────────────────────────────────────────
const CITY_OPTIONS = ["Medina de Pomar", "Villarcayo"];

const TABS = [
  { key: "all", label: "Todas" },
  { key: "in-progress", label: "En Progreso" },
  { key: "pending-client", label: "Pendiente Cliente" },
  { key: "pending-pieces", label: "Pend. de Piezas" },
  { key: "delivery", label: "Finalizadas" },
  { key: "completed", label: "Entregados" },
  { key: "canceled", label: "Cancelados" },
] as const;

interface ClientHistoryTarget {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

export default function ServiceOrder() {
  const router = useRouter();
  const so = useServiceOrders();
  const tc = useTableConfig(so.orders);

  const [clientHistoryTarget, setClientHistoryTarget] = useState<ClientHistoryTarget | null>(null);

  // ── Derived data for modals ─────────────────────────────────────────────
  const paymentOrder = so.showPaymentCard
    ? so.orders.find((o) => o.id === so.showPaymentCard)
    : null;
  const finalizationOrder = so.showFinalizationCard
    ? so.orders.find((o) => o.id === so.showFinalizationCard)
    : null;
  const notesOrder = so.showNotesModal
    ? so.orders.find((o) => o.id === so.showNotesModal)
    : null;
  const whatsappOrder = so.showWhatsAppModal
    ? so.orders.find((o) => o.id === so.showWhatsAppModal)
    : null;
  const pendingDeleteOrder = so.pendingDeleteId
    ? so.orders.find((o) => o.id === so.pendingDeleteId)
    : null;

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleEditOrder = (orderId: string) => {
    router.push(`/serviceOrders/${orderId}/edit`);
  };

  const handlePrintPDF = (orderId: string) => {
    const order = so.orders.find((o) => o.id === orderId);
    if (order) printOrderPDF(order);
  };

  const handlePrintTicket = (orderId: string) => {
    const order = so.orders.find((o) => o.id === orderId);
    if (order) printOrderTicket(order);
  };

  const handleSendEmail = (orderId: string) => {
    const order = so.orders.find((o) => o.id === orderId);
    if (!order?.client.email) {
      import("nextjs-toast-notify").then(({ showToast }) =>
        showToast.error("El cliente no tiene email registrado", {
          duration: 4000,
          progress: true,
          position: "top-right",
          transition: "fadeIn",
        }),
      );
      return;
    }

    const subject = `Actualización de Servicio Técnico - Orden #${order.id.substring(0, 8)}`;
    const body = `Estimado/a ${order.client.firstName},

Le escribimos para informarle sobre el estado de su servicio técnico:

INFORMACIÓN DEL SERVICIO:
• Orden: #${order.id.substring(0, 8)}
• Dispositivo: ${order.device.brand} ${order.device.model}
• Estado actual: ${STATUS_LABELS[order.status] ?? order.status}
• Ciudad: ${order.client.city ?? "Sin ciudad"}
${order.totalPrice ? `• Importe total: ${formatCurrency(order.totalPrice)}` : ""}

Si tiene alguna pregunta, no dude en contactarnos.

Saludos cordiales,
Equipo de Servicio Técnico`;

    window.location.href = `mailto:${order.client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <h1 className={styles.title}>Órdenes de Servicio</h1>
        <div className={styles.headerActions}>
          <button
            className={styles.exportButton}
            onClick={() => so.exportToExcel(tc.filteredOrders)}
          >
            <Download size={18} />
            <span>Exportar Excel</span>
          </button>
          <Link href="/serviceOrders/newServiceOrder" className={styles.newOrderButton}>
            <Plus size={18} />
            <span>Nueva Orden</span>
          </Link>
        </div>
      </div>

      {/* ── TABS + SEARCH ── */}
      <div className={styles.tabsAndSearch}>
        <div className={styles.tabs}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              className={`${styles.tab} ${tc.activeTab === key ? styles.activeTab : ""}`}
              onClick={() => tc.setActiveTab(key)}
            >
              {label}
              {tc.tabCounts[key] > 0 && (
                <span className={`${styles.tabBadge} ${tc.activeTab === key ? styles.tabBadgeActive : ""}`}>
                  {tc.tabCounts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.searchContainer}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="Buscar por ID, cliente, dispositivo..."
              value={tc.searchTerm}
              onChange={(e) => tc.setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
            {tc.searchTerm && (
              <button
                className={styles.clearSearchButton}
                onClick={() => tc.setSearchTerm("")}
                title="Borrar búsqueda"
              >
                ×
              </button>
            )}
          </div>
          <div className={styles.filterDropdownWrapper} ref={tc.filterPanelRef}>
            <button
              className={`${styles.filterButton} ${tc.isAnyFilterActive ? styles.filterActive : ""} ${tc.showFilterPanel ? styles.filterButtonOpen : ""}`}
              title="Filtros avanzados"
              onClick={() => tc.setShowFilterPanel((prev) => !prev)}
            >
              <Filter size={18} />
              {tc.isAnyFilterActive && <span className={styles.filterActiveDot} />}
            </button>
            {tc.showFilterPanel && (
              <FilterPanel
                visibleColumns={tc.visibleColumns}
                setVisibleColumns={tc.setVisibleColumns}
                statusFilters={tc.statusFilters}
                setStatusFilters={tc.setStatusFilters}
                priorityFilters={tc.priorityFilters}
                setPriorityFilters={tc.setPriorityFilters}
              />
            )}
          </div>
        </div>
      </div>

      {so.loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner}></div>
        </div>
      )}

      {/* ── TABLE ── */}
      <div className={styles.tableContainer}>
        {so.loading && so.orders.length === 0 ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p>Cargando órdenes de servicio...</p>
          </div>
        ) : so.error ? (
          <div className={styles.errorContainer}>
            <AlertCircle size={36} className={styles.errorIcon} />
            <p className={styles.errorMessage}>{so.error}</p>
            <button className={styles.retryButton} onClick={() => void so.fetchOrders()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.actionsColumn}>Acciones</th>
                  {tc.visibleColumns.id && (
                    <th className={`${styles.idColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("id")}>
                      ID {tc.getSortIcon("id")}
                    </th>
                  )}
                  {tc.visibleColumns.client && (
                    <th className={`${styles.clientColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("clientName")}>
                      Cliente {tc.getSortIcon("clientName")}
                    </th>
                  )}
                  {tc.visibleColumns.device && (
                    <th className={`${styles.deviceColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("device")}>
                      Dispositivo {tc.getSortIcon("device")}
                    </th>
                  )}
                  {tc.visibleColumns.services && (
                    <th className={`${styles.servicesColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("services")}>
                      Servicios {tc.getSortIcon("services")}
                    </th>
                  )}
                  {tc.visibleColumns.priority && (
                    <th className={`${styles.priorityColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("priority")}>
                      Prioridad {tc.getSortIcon("priority")}
                    </th>
                  )}
                  {tc.visibleColumns.status && (
                    <th className={`${styles.statusColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("status")}>
                      Estado {tc.getSortIcon("status")}
                    </th>
                  )}
                  {tc.visibleColumns.payment && (
                    <th className={`${styles.paymentColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("paymentStatus")}>
                      Pago {tc.getSortIcon("paymentStatus")}
                    </th>
                  )}
                  {tc.visibleColumns.financial && (
                    <th className={`${styles.financialColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("totalPrice")}>
                      Financiero {tc.getSortIcon("totalPrice")}
                    </th>
                  )}
                  {tc.visibleColumns.city && (
                    <th className={`${styles.technicianColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("city")}>
                      Ciudad {tc.getSortIcon("city")}
                    </th>
                  )}
                  {tc.visibleColumns.dates && (
                    <th className={`${styles.dateColumn} ${styles.sortableHeader}`} onClick={() => tc.handleSort("createdAt")}>
                      Fechas {tc.getSortIcon("createdAt")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {tc.currentOrders.length > 0 ? (
                  tc.currentOrders.map((order) => (
                    <tr key={order.id} className={styles.tableRow}>
                      {/* Actions */}
                      <td className={styles.actionsColumn}>
                        <div className={styles.actionsContainer}>
                          <DropdownMenu
                            trigger={
                              <button className={styles.actionsDropdownTrigger}>
                                <MoreVertical size={18} />
                                {so.noteCounts[order.id] > 0 && (
                                  <span className={styles.notificationDot}></span>
                                )}
                              </button>
                            }
                          >
                            <div className={styles.actionsDropdown}>
                              <button className={styles.dropdownAction} onClick={() => handleEditOrder(order.id)}>
                                <Edit size={16} />
                                <span>Ver / Editar</span>
                              </button>
                              <button className={styles.dropdownAction} onClick={() => so.setShowNotesModal(order.id)}>
                                <StickyNote size={16} />
                                <span>Notas</span>
                                {so.noteCounts[order.id] > 0 && (
                                  <span className={styles.notificationBadge}>{so.noteCounts[order.id]}</span>
                                )}
                              </button>
                              <div className={styles.dropdownDivider}></div>
                              <button className={styles.dropdownAction} onClick={() => handlePrintPDF(order.id)}>
                                <FileText size={16} />
                                <span>Imprimir PDF</span>
                              </button>
                              <button className={styles.dropdownAction} onClick={() => handlePrintTicket(order.id)}>
                                <Ticket size={16} />
                                <span>Imprimir Ticket</span>
                              </button>
                              <button className={styles.dropdownAction} onClick={() => so.setShowWhatsAppModal(order.id)}>
                                <Phone size={16} />
                                <span>Enviar por WhatsApp</span>
                              </button>
                              <button className={styles.dropdownAction} onClick={() => handleSendEmail(order.id)}>
                                <Mail size={16} />
                                <span>Enviar por email</span>
                              </button>
                              <div className={styles.dropdownDivider}></div>
                              <button
                                className={`${styles.dropdownAction} ${styles.dropdownActionDanger}`}
                                onClick={() => so.handleDeleteOrder(order.id)}
                              >
                                <Trash2 size={16} />
                                <span>Eliminar</span>
                              </button>
                            </div>
                          </DropdownMenu>
                        </div>
                      </td>

                      {/* ID */}
                      {tc.visibleColumns.id && (
                        <td className={styles.idColumn}>
                          <div className={styles.idContainer}>
                            <span className={styles.idNumber}>#{order.id.substring(0, 8)}</span>
                          </div>
                        </td>
                      )}

                      {/* Cliente */}
                      {tc.visibleColumns.client && (
                        <td className={styles.clientColumn}>
                          <div className={styles.clientInfo}>
                            <button
                              className={styles.clientLink}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                              title="Ver historial del cliente"
                              onClick={() =>
                                setClientHistoryTarget({
                                  id: order.client.id,
                                  name: `${order.client.firstName} ${order.client.lastName ?? ""}`.trim(),
                                  phone: order.client.phoneNumber,
                                  email: order.client.email,
                                })
                              }
                            >
                              <div className={styles.clientName}>
                                <User size={14} className={styles.clientIcon} />
                                {`${order.client?.firstName} ${order.client?.lastName ?? ""}`}
                              </div>
                            </button>
                            {order.client?.phoneNumber && (
                              <div className={styles.clientContact}>
                                <Phone size={12} />
                                <span>{order.client.phoneNumber}</span>
                              </div>
                            )}
                            {order.client?.email && (
                              <div className={styles.clientContact}>
                                <Mail size={12} />
                                <span>{order.client.email}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Dispositivo */}
                      {tc.visibleColumns.device && (
                        <td className={styles.deviceColumn}>
                          <div className={styles.deviceInfo}>
                            <div className={styles.deviceName}>
                              <Smartphone size={14} className={styles.deviceIcon} />
                              {order.device
                                ? `${order.device.brand ? order.device.brand + " " : ""}${order.device.model}`
                                : "N/A"}
                            </div>
                            {order.device?.imei && (
                              <div className={styles.deviceSerial}>IMEI: {order.device.imei}</div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Servicios */}
                      {tc.visibleColumns.services && (
                        <td className={styles.servicesColumn}>
                          <div className={styles.servicesInfo}>
                            {order.services && order.services.length > 0 ? (
                              <div className={styles.servicesList}>
                                <div className={styles.servicesCount}>
                                  <Wrench size={12} />
                                  <span>
                                    {order.services.length} servicio{order.services.length !== 1 ? "s" : ""}
                                  </span>
                                </div>
                                <div className={styles.servicesPreview}>
                                  {order.services.slice(0, 2).map((service, index) => (
                                    <span key={index} className={styles.serviceTag}>
                                      {service.name ?? service.description}
                                    </span>
                                  ))}
                                  {order.services.length > 2 && (
                                    <span className={styles.moreServices}>
                                      +{order.services.length - 2} más
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className={styles.noServices}>Sin servicios</span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Prioridad */}
                      {tc.visibleColumns.priority && (
                        <td className={styles.priorityColumn}>
                          <EditableDropdown
                            order={order}
                            field="priority"
                            currentValue={order.priority}
                            options={Object.values(Priority)}
                            getClassFunction={getPriorityClass}
                            renderCurrentValue={(priority) => (
                              <>
                                <div className={styles.priorityIcon}>
                                  {priority === Priority.URGENT && <AlertCircle size={12} />}
                                  {priority === Priority.HIGH && <AlertTriangle size={12} />}
                                  {priority === Priority.MEDIUM && <Clock size={12} />}
                                  {priority === Priority.LOW && <CheckCircle size={12} />}
                                </div>
                                {PRIORITY_LABELS[priority] ?? priority}
                              </>
                            )}
                            isEditing={tc.editingCell?.field === "priority" && tc.editingCell?.orderId === order.id}
                            onOpen={() => tc.openEditing("priority", order.id)}
                            onClose={tc.closeEditing}
                            onSelect={(orderId, field, value) =>
                              so.updateOrderField(orderId, field, value, tc.closeEditing)
                            }
                          />
                        </td>
                      )}

                      {/* Estado */}
                      {tc.visibleColumns.status && (
                        <td className={styles.statusColumn}>
                          <div className={styles.statusContainer}>
                            <EditableDropdown
                              order={order}
                              field="status"
                              currentValue={order.status}
                              options={Object.values(ServiceStatus)}
                              getClassFunction={getStatusClass}
                              renderCurrentValue={(status) => (
                                <>
                                  <div className={styles.statusIcon}>{getStatusIcon(status)}</div>
                                  <span>{STATUS_LABELS[status] ?? status}</span>
                                </>
                              )}
                              isEditing={tc.editingCell?.field === "status" && tc.editingCell?.orderId === order.id}
                              onOpen={() => tc.openEditing("status", order.id)}
                              onClose={tc.closeEditing}
                              onSelect={(orderId, field, value) =>
                                so.updateOrderField(orderId, field, value, tc.closeEditing)
                              }
                            />
                          </div>
                        </td>
                      )}

                      {/* Pago */}
                      {tc.visibleColumns.payment && (
                        <td className={styles.paymentColumn}>
                          <div className={styles.paymentInfo} onClick={() => so.setShowPaymentCard(order.id)}>
                            {order.paymentStatus ? (
                              <>
                                <div className={`${styles.paymentStatus} ${getPaymentStatusClass(order.paymentStatus.toLowerCase())}`}>
                                  <div className={styles.paymentIcon}>
                                    {getPaymentStatusIcon(order.paymentStatus.toLowerCase())}
                                  </div>
                                  <span>{PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</span>
                                </div>
                                {order.paymentMethod && (
                                  <div className={styles.paymentMethod}>
                                    <CreditCard size={12} />
                                    <span>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className={styles.noPaymentInfo}>Clic para editar</span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Financiero */}
                      {tc.visibleColumns.financial && (
                        <td className={styles.financialColumn}>
                          <div className={styles.financialInfo}>
                            <div className={styles.totalPrice}>
                              <span className={styles.label}>Total:</span>
                              <span className={styles.amount}>
                                {order.totalPrice != null ? formatCurrency(order.totalPrice) : "N/A"}
                              </span>
                            </div>
                            {order.amountPaid != null && order.amountPaid > 0 && (
                              <div className={styles.paidAmount}>
                                <span className={styles.label}>Pagado:</span>
                                <span className={styles.amount}>{formatCurrency(order.amountPaid)}</span>
                              </div>
                            )}
                            {order.balance != null && order.balance > 0 && (
                              <div className={styles.balance}>
                                <span className={styles.label}>Saldo:</span>
                                <span className={`${styles.amount} ${styles.balanceAmount}`}>
                                  {formatCurrency(order.balance)}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Ciudad */}
                      {tc.visibleColumns.city && (
                        <td className={styles.cityColumn}>
                          <div className={styles.cityInfo}>
                            <EditableDropdown
                              order={order}
                              field="client.city"
                              currentValue={order.client.city}
                              options={CITY_OPTIONS}
                              getClassFunction={() => styles.cityValue}
                              renderCurrentValue={(city) => (
                                <>
                                  <MapPin size={14} className={styles.cityIcon} />
                                  <span>{city || "Sin ciudad"}</span>
                                </>
                              )}
                              isEditing={tc.editingCell?.field === "client.city" && tc.editingCell?.orderId === order.id}
                              onOpen={() => tc.openEditing("client.city", order.id)}
                              onClose={tc.closeEditing}
                              onSelect={(orderId, field, value) =>
                                so.updateOrderField(orderId, field, value, tc.closeEditing)
                              }
                            />
                          </div>
                        </td>
                      )}

                      {/* Fechas */}
                      {tc.visibleColumns.dates && (
                        <td className={styles.dateColumn}>
                          <div className={styles.dateInfo}>
                            <div className={styles.createdDate}>
                              <Calendar size={12} className={styles.dateIcon} />
                              <span>{formatDate(order.createdAt)}</span>
                            </div>
                            {order.updatedAt && order.updatedAt !== order.createdAt && (
                              <div className={styles.updatedDate}>
                                <Clock size={12} className={styles.dateIcon} />
                                <span>Mod: {formatDate(order.updatedAt)}</span>
                              </div>
                            )}
                            {order.createdAt &&
                              order.status !== ServiceStatus.ENTREGADO &&
                              order.status !== ServiceStatus.CANCELADO && (() => {
                                const days = Math.floor(
                                  (Date.now() - new Date(order.createdAt).getTime()) / 86_400_000
                                );
                                const isOld = days >= 7;
                                return (
                                  <div style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    marginTop: 3,
                                    fontSize: "0.68rem",
                                    fontWeight: 600,
                                    padding: "1px 6px",
                                    borderRadius: 999,
                                    background: isOld ? "#fef2f2" : "#f1f5f9",
                                    color: isOld ? "#dc2626" : "#64748b",
                                  }}>
                                    <Clock size={9} />
                                    {days === 0 ? "hoy" : `${days}d abierto`}
                                  </div>
                                );
                              })()
                            }
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tc.visibleColumnCount} className={styles.noResults}>
                      <div className={styles.noResultsContent}>
                        <CheckCircle2 size={32} className={styles.noResultsIcon} />
                        <p>No se encontraron resultados para su búsqueda</p>
                        {tc.searchTerm && (
                          <button className={styles.clearFiltersButton} onClick={() => tc.setSearchTerm("")}>
                            Limpiar filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── PAGINATION ── */}
      {tc.sortedOrders.length > 0 && (
        <div className={styles.tablePagination}>
          <div className={styles.paginationInfo}>
            <span>
              Mostrando{" "}
              <span className={styles.paginationHighlight}>{tc.indexOfFirstItem + 1}</span>
              {" "}-{" "}
              <span className={styles.paginationHighlight}>
                {Math.min(tc.indexOfLastItem, tc.sortedOrders.length)}
              </span>
              {" "}de{" "}
              <span className={styles.paginationHighlight}>{tc.sortedOrders.length}</span>
              {" "}órdenes
            </span>
            <select
              value={tc.itemsPerPage}
              onChange={(e) => { tc.setItemsPerPage(Number(e.target.value)); tc.setCurrentPage(1); }}
              className={styles.itemsPerPageSelect}
            >
              <option value={5}>5 por página</option>
              <option value={10}>10 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>
          </div>

          <div className={styles.paginationControls}>
            <button
              className={styles.paginationButton}
              onClick={() => tc.paginate(tc.currentPage - 1)}
              disabled={tc.currentPage === 1}
            >
              Anterior
            </button>

            <div className={styles.paginationPages}>
              {tc.currentPage > 3 && (
                <>
                  <button className={styles.paginationPageButton} onClick={() => tc.paginate(1)}>1</button>
                  {tc.currentPage > 4 && <span className={styles.paginationEllipsis}>...</span>}
                </>
              )}
              {Array.from({ length: tc.totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    page === tc.currentPage ||
                    Math.abs(page - tc.currentPage) <= 2,
                )
                .map((page) => (
                  <button
                    key={page}
                    className={`${styles.paginationPageButton} ${tc.currentPage === page ? styles.paginationPageActive : ""}`}
                    onClick={() => tc.paginate(page)}
                  >
                    {page}
                  </button>
                ))}
              {tc.currentPage < tc.totalPages - 2 && (
                <>
                  {tc.currentPage < tc.totalPages - 3 && <span className={styles.paginationEllipsis}>...</span>}
                  <button className={styles.paginationPageButton} onClick={() => tc.paginate(tc.totalPages)}>
                    {tc.totalPages}
                  </button>
                </>
              )}
            </div>

            <button
              className={styles.paginationButton}
              onClick={() => tc.paginate(tc.currentPage + 1)}
              disabled={tc.currentPage === tc.totalPages}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}
      {paymentOrder && (
        <PaymentEditCard
          order={paymentOrder}
          onClose={() => so.setShowPaymentCard(null)}
          onSave={(paymentData) => {
            so.updateOrderPayment(so.showPaymentCard!, paymentData);
            so.setShowPaymentCard(null);
          }}
          formatCurrency={formatCurrency}
          getPaymentStatusIcon={getPaymentStatusIcon}
          getPaymentStatusClass={getPaymentStatusClass}
        />
      )}

      {finalizationOrder && (
        <FinalizationCard
          order={finalizationOrder}
          onClose={() => so.setShowFinalizationCard(null)}
          onFinalize={(data) => so.finalizeOrderWithParts(so.showFinalizationCard!, data)}
          inventoryItems={so.inventoryItems}
          loadingInventory={so.loadingInventory}
        />
      )}

      {notesOrder && (
        <NotesModal
          order={notesOrder}
          onClose={() => {
            void so.fetchNoteCount(so.showNotesModal!);
            so.setShowNotesModal(null);
          }}
        />
      )}

      {whatsappOrder && (
        <WhatsAppModal
          order={whatsappOrder}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          onClose={() => so.setShowWhatsAppModal(null)}
        />
      )}

      {/* ── HISTORIAL DEL CLIENTE ── */}
      {clientHistoryTarget && (
        <ClientHistoryModal
          clientId={clientHistoryTarget.id}
          clientName={clientHistoryTarget.name}
          clientPhone={clientHistoryTarget.phone}
          clientEmail={clientHistoryTarget.email}
          onClose={() => setClientHistoryTarget(null)}
        />
      )}

      {/* ── CONFIRM DELETE DIALOG ── */}
      {pendingDeleteOrder && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmIcon}>
              <Trash2 size={28} color="#dc2626" />
            </div>
            <h3 className={styles.confirmTitle}>Eliminar orden</h3>
            <p className={styles.confirmText}>
              ¿Seguro que deseas eliminar la orden{" "}
              <strong>#{pendingDeleteOrder.id.substring(0, 8)}</strong> de{" "}
              <strong>{pendingDeleteOrder.client.firstName} {pendingDeleteOrder.client.lastName}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancel} onClick={so.cancelDelete}>
                <X size={14} />
                Cancelar
              </button>
              <button className={styles.confirmDelete} onClick={() => void so.confirmDelete()}>
                <Trash2 size={14} />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
