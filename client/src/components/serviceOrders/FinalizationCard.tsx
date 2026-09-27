"use client";
import { useState, useEffect, useRef } from "react";
import { Trash2, ClipboardList, ChevronDown, Package } from "lucide-react";
import { showToast } from "nextjs-toast-notify";
import { ServiceOrder, InventoryItem, FinalizationData, SelectedPart } from "@/app/serviceOrders/types";
import { formatCurrency } from "@/app/serviceOrders/utils/format";
import styles from "./FinalizationCard.module.css";

interface FinalizationCardProps {
  order: ServiceOrder;
  onClose: () => void;
  onFinalize: (finalizationData: FinalizationData) => void;
  inventoryItems: InventoryItem[];
  loadingInventory: boolean;
}

export function FinalizationCard({
  order,
  onClose,
  onFinalize,
  inventoryItems,
  loadingInventory,
}: FinalizationCardProps) {
  const [localSelectedParts, setLocalSelectedParts] = useState<SelectedPart[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmNoPartsVisible, setConfirmNoPartsVisible] = useState(false);
  const [workNotes, setWorkNotes] = useState("");
  // Secciones plegables — notas abierta por defecto, piezas colapsada
  const [notesOpen, setNotesOpen] = useState(true);
  const [partsOpen, setPartsOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const addPart = (inventoryItem: InventoryItem): void => {
    const existingPart = localSelectedParts.find((p) => p.id === inventoryItem.id);
    if (existingPart) {
      if (existingPart.stock < inventoryItem.stock) {
        setLocalSelectedParts((prev) =>
          prev.map((p) => p.id === inventoryItem.id ? { ...p, stock: p.stock + 1 } : p),
        );
      } else {
        showToast.warning(`Stock insuficiente. Disponible: ${inventoryItem.stock}`, {
          duration: 3000, progress: true, position: "top-right", transition: "fadeIn",
        });
      }
    } else {
      setLocalSelectedParts((prev) => [
        ...prev,
        { id: inventoryItem.id, name: inventoryItem.name, salesPrice: inventoryItem.salesPrice, stock: 1, maxStock: inventoryItem.stock },
      ]);
    }
  };

  const removePart = (partId: string) =>
    setLocalSelectedParts((prev) => prev.filter((p) => p.id !== partId));

  const updatePartQuantity = (partId: string, newQuantity: number) => {
    const part = localSelectedParts.find((p) => p.id === partId);
    if (!part) return;
    if (newQuantity <= 0) { removePart(partId); return; }
    if (newQuantity > part.maxStock) {
      showToast.warning(`Stock insuficiente. Disponible: ${part.maxStock}`, {
        duration: 3000, progress: true, position: "top-right", transition: "fadeIn",
      });
      return;
    }
    setLocalSelectedParts((prev) =>
      prev.map((p) => p.id === partId ? { ...p, stock: newQuantity } : p),
    );
  };

  const getTotalCost = () =>
    localSelectedParts.reduce((total, part) => total + part.salesPrice * part.stock, 0);

  const filteredInventoryItems = inventoryItems.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleFinalize = () => {
    if (localSelectedParts.length === 0 && !confirmNoPartsVisible) {
      setConfirmNoPartsVisible(true);
      return;
    }
    onFinalize({
      usedParts: localSelectedParts,
      totalPartsCost: getTotalCost(),
      workNotes: workNotes.trim() || undefined,
    });
  };

  return (
    <div className={styles.finalizationCardOverlay}>
      <div className={styles.finalizationCard} ref={cardRef}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className={styles.finalizationCardHeader}>
          <h3>Finalizar Orden #{order.id.substring(0, 8)}</h3>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>

        <div className={styles.finalizationCardContent}>

          {/* ── Sección 1: Notas del técnico (plegable) ─────────────────── */}
          <div className={styles.collapsibleSection}>
            <button
              type="button"
              className={styles.collapsibleHeader}
              onClick={() => setNotesOpen((o) => !o)}
            >
              <div className={styles.collapsibleTitle}>
                <ClipboardList size={15} className={styles.sectionIcon} />
                <span>Notas del trabajo</span>
                {workNotes.trim() && !notesOpen && (
                  <span className={styles.sectionBadge}>
                    {workNotes.trim().length > 30
                      ? workNotes.trim().slice(0, 30) + "…"
                      : workNotes.trim()}
                  </span>
                )}
              </div>
              <ChevronDown
                size={15}
                className={`${styles.chevron} ${notesOpen ? styles.chevronOpen : ""}`}
              />
            </button>

            {notesOpen && (
              <div className={styles.collapsibleBody}>
                <textarea
                  className={styles.notesTextarea}
                  rows={4}
                  placeholder="Descripción del trabajo realizado…"
                  value={workNotes}
                  onChange={(e) => setWorkNotes(e.target.value)}
                  maxLength={2000}
                />
                <div className={styles.notesCounter}>{workNotes.length}/2000</div>
              </div>
            )}
          </div>

          {/* ── Sección 2: Repuestos (plegable) ─────────────────────────── */}
          <div className={styles.collapsibleSection}>
            <button
              type="button"
              className={styles.collapsibleHeader}
              onClick={() => setPartsOpen((o) => !o)}
            >
              <div className={styles.collapsibleTitle}>
                <Package size={15} className={styles.sectionIcon} />
                <span>Repuestos utilizados</span>
                {localSelectedParts.length > 0 && (
                  <span className={styles.partsBadge}>
                    {localSelectedParts.length} · {formatCurrency(getTotalCost())}
                  </span>
                )}
              </div>
              <ChevronDown
                size={15}
                className={`${styles.chevron} ${partsOpen ? styles.chevronOpen : ""}`}
              />
            </button>

            {partsOpen && (
              <div className={styles.collapsibleBody}>
                {localSelectedParts.length > 0 && (
                  <div className={styles.selectedParts}>
                    {localSelectedParts.map((part) => (
                      <div key={part.id} className={styles.selectedPart}>
                        <div className={styles.partInfo}>
                          <span className={styles.partName}>{part.name}</span>
                          <span className={styles.partPrice}>
                            {formatCurrency(part.salesPrice)} c/u
                          </span>
                        </div>
                        <div className={styles.partControls}>
                          <button onClick={() => updatePartQuantity(part.id, part.stock - 1)} className={styles.quantityButton}>-</button>
                          <span className={styles.quantity}>{part.stock}</span>
                          <button onClick={() => updatePartQuantity(part.id, part.stock + 1)} className={styles.quantityButton}>+</button>
                          <button onClick={() => removePart(part.id)} className={styles.removePartButton}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className={styles.partTotal}>
                          {formatCurrency(part.salesPrice * part.stock)}
                        </div>
                      </div>
                    ))}
                    <div className={styles.partsTotal}>
                      <strong>Total repuestos: {formatCurrency(getTotalCost())}</strong>
                    </div>
                  </div>
                )}

                <div className={styles.searchSection}>
                  <h5 className={styles.subsectionTitle}>Inventario disponible</h5>
                  <div className={styles.searchContainer}>
                    <input
                      type="text"
                      placeholder="Buscar repuesto…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={styles.searchInput}
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm("")} className={styles.clearSearchButton} title="Limpiar">×</button>
                    )}
                  </div>
                </div>

                <div className={styles.availableParts}>
                  {loadingInventory ? (
                    <div className={styles.loadingInventory}>
                      <div className={styles.loadingSpinner}></div>
                      Cargando inventario...
                    </div>
                  ) : filteredInventoryItems.length > 0 ? (
                    <div className={styles.partsGrid}>
                      {filteredInventoryItems.map((item) => (
                        <div key={item.id} className={styles.inventoryItem} onClick={() => addPart(item)}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemName}>{item.name}</span>
                            <span className={styles.itemPrice}>{formatCurrency(item.salesPrice)} c/u</span>
                          </div>
                          <div className={styles.itemStock}>Stock: {item.stock}</div>
                        </div>
                      ))}
                    </div>
                  ) : searchTerm ? (
                    <div className={styles.noInventoryItems}>Sin resultados para &quot;{searchTerm}&quot;</div>
                  ) : (
                    <div className={styles.noInventoryItems}>Sin repuestos en inventario</div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── Acciones ─────────────────────────────────────────────────────── */}
        <div className={styles.finalizationCardActions}>
          {confirmNoPartsVisible ? (
            <>
              <span className={styles.confirmText}>¿Finalizar sin repuestos?</span>
              <button onClick={() => setConfirmNoPartsVisible(false)} className={styles.cancelButton}>Cancelar</button>
              <button onClick={handleFinalize} className={styles.finalizeButton}>Confirmar</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className={styles.cancelButton}>Cancelar</button>
              <button onClick={handleFinalize} className={styles.finalizeButton}>Finalizar Orden</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
