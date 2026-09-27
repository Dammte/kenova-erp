"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { showToast } from "nextjs-toast-notify";
import styles from "./page.module.css";
interface ServiceOrder {
  id: string;
  client: {
    id: string;
    firstName: string;
    lastName?: string;
    phoneNumber?: string;
    email?: string;
    city?: string;
  };
  device: {
    brand: string;
    model: string;
    imei?: string;
    code?: string;
    pattern?: string;
  };
  priority: string;
  status: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  paymentMethod?: string;
  paymentStatus?: string;
  totalPrice?: number;
  amountPaid?: number;
  balance?: number;
  services?: { name?: string; description?: string }[];
}

interface PaymentEditCardProps {
  order: ServiceOrder;
  onClose: () => void;
  onSave: (paymentData: any) => void;
  formatCurrency: (amount: number | undefined) => string;
  getPaymentStatusIcon: (
    status: "paid" | "paid_partial" | "pending" | "overdue"
  ) => React.ReactElement;
  getPaymentStatusClass: (status: string) => string;
}

export default function PaymentEditCard({
  order,
  onClose,
  onSave,
  formatCurrency,
  getPaymentStatusIcon,
  getPaymentStatusClass,
}: PaymentEditCardProps) {
  const [localPaymentData, setLocalPaymentData] = useState({
    paymentMethod: order.paymentMethod || "cash",
    totalPrice: order.totalPrice ?? 0,
    amountPaid: order.amountPaid || 0,
  });
  const cardRef = useRef<HTMLDivElement>(null);
  const balance = useMemo(() => {
    return localPaymentData.totalPrice - localPaymentData.amountPaid;
  }, [localPaymentData.totalPrice, localPaymentData.amountPaid]);
  const autoPaymentStatus = useMemo(() => {
    if (balance <= 0) return "paid";
    if (localPaymentData.amountPaid > 0) return "paid_partial";
    return "pending";
  }, [balance, localPaymentData.amountPaid]);
  const validation = useMemo(() => {
    if (localPaymentData.totalPrice < 0) {
      return { isValid: false, message: "El total no puede ser negativo" };
    }
    if (localPaymentData.amountPaid < 0) {
      return {
        isValid: false,
        message: "El monto pagado no puede ser negativo",
      };
    }
    if (localPaymentData.amountPaid > localPaymentData.totalPrice) {
      return {
        isValid: false,
        message: "El pago excede el total de la orden",
      };
    }
    return { isValid: true, message: "" };
  }, [localPaymentData]);
  const handleQuickPay = (amount: number) => {
    const newAmountPaid = Math.min(
      localPaymentData.amountPaid + amount,
      localPaymentData.totalPrice
    );
    setLocalPaymentData((prev) => ({
      ...prev,
      amountPaid: newAmountPaid,
    }));
  };
  const handlePayInFull = () => {
    setLocalPaymentData((prev) => ({
      ...prev,
      amountPaid: prev.totalPrice,
    }));
  };
  const handleClearPayment = () => {
    setLocalPaymentData((prev) => ({ ...prev, amountPaid: 0 }));
  };
  const handleSave = () => {
    if (!validation.isValid) {
      showToast.error(validation.message, {
        duration: 4000,
        progress: true,
        position: "top-right",
        transition: "fadeIn",
        icon: "",
      });
      return;
    }
    const dataToSave = {
      ...localPaymentData,
      paymentStatus: autoPaymentStatus,
      balance: balance,
    };
    onSave(dataToSave);
    showToast.success("Información de pago actualizada correctamente", {
      duration: 4000,
      progress: true,
      position: "top-right",
      transition: "fadeIn",
      icon: "",
    });
  };
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);
  return (
    <div className={styles.paymentCardOverlay}>
      <div className={styles.paymentCard} ref={cardRef}>
        <div className={styles.paymentCardHeader}>
          <h3>Editar Información de Pago</h3>
          <button onClick={onClose} className={styles.closeButton}>
            ×
          </button>
        </div>
        <div className={styles.paymentCardContent}>
          {/* Estado de Pago (Solo Lectura - Auto-calculado) */}
          <div className={styles.statusBadgeContainer}>
            <label className={styles.statusLabel}>Estado de Pago</label>
            <div className={styles.statusBadgeWrapper}>
              <span
                className={`${styles.badge} ${
                  styles.paymentBadge
                } ${getPaymentStatusClass(autoPaymentStatus)}`}
              >
                <span className={styles.badgeIcon}>
                  {getPaymentStatusIcon(
                    autoPaymentStatus as
                      | "paid"
                      | "paid_partial"
                      | "pending"
                      | "overdue"
                  )}
                </span>
                {autoPaymentStatus === "paid"
                  ? "Pagado"
                  : autoPaymentStatus === "paid_partial"
                  ? "Parcial"
                  : autoPaymentStatus === "pending"
                  ? "Pendiente"
                  : autoPaymentStatus === "overdue"
                  ? "Vencido"
                  : autoPaymentStatus}
              </span>
            </div>
            <small className={styles.statusHelp}>
              ℹ️ Se actualiza automáticamente según el balance
            </small>
          </div>
          {/* Método de Pago */}
          <div className={styles.formGroup}>
            <label>Método de Pago</label>
            <select
              value={localPaymentData.paymentMethod}
              onChange={(e) =>
                setLocalPaymentData((prev) => ({
                  ...prev,
                  paymentMethod: e.target.value,
                }))
              }
              className={styles.formSelect}
            >
              <option value="cash">💵 Efectivo</option>
              <option value="card">💳 Tarjeta</option>
              <option value="transfer">🏦 Transferencia</option>
              <option value="other">📝 Otro</option>
            </select>
          </div>
          {/* Información Financiera */}
          <div className={styles.financialSection}>
            <div className={styles.formGroup}>
              <label>Total de la Orden</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={localPaymentData.totalPrice || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setLocalPaymentData((prev) => ({
                    ...prev,
                    totalPrice: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="0.00"
                className={styles.formInput}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Monto Pagado</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={localPaymentData.totalPrice}
                value={localPaymentData.amountPaid || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setLocalPaymentData((prev) => ({
                    ...prev,
                    amountPaid: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="0.00"
                className={styles.formInput}
              />
            </div>
            {/* Botones de Pago Rápido */}
            {balance > 0 && (
              <div className={styles.quickPaySection}>
                <label>Acciones Rápidas</label>
                <div className={styles.quickPayButtons}>
                  <button
                    onClick={handlePayInFull}
                    className={`${styles.quickPayButton} ${styles.payFullButton}`}
                    title="Marcar como totalmente pagado"
                  >
                    💰 Pagar Todo
                  </button>
                  {balance >= 100 && (
                    <button
                      onClick={() => handleQuickPay(100)}
                      className={styles.quickPayButton}
                    >
                      +100€
                    </button>
                  )}
                  {balance >= 50 && (
                    <button
                      onClick={() => handleQuickPay(50)}
                      className={styles.quickPayButton}
                    >
                      +50€
                    </button>
                  )}
                  {balance >= 20 && (
                    <button
                      onClick={() => handleQuickPay(10)}
                      className={styles.quickPayButton}
                    >
                      +10€
                    </button>
                  )}
                </div>
              </div>
            )}
            {localPaymentData.amountPaid > 0 && (
              <button
                onClick={handleClearPayment}
                className={styles.clearButton}
                title="Restablecer el monto pagado a $0"
              >
                🗑️ Limpiar Pago
              </button>
            )}
          </div>
          {/* Mensaje de Validación */}
          {!validation.isValid && (
            <div className={styles.validationError}>
              <AlertTriangle size={16} />
              <span>{validation.message}</span>
            </div>
          )}
          {/* Resumen Visual */}
          <div className={styles.paymentSummary}>
            <h4 className={styles.summaryTitle}>Resumen de Pago</h4>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Total:</span>
              <strong className={styles.summaryValue}>
                {formatCurrency(localPaymentData.totalPrice)}
              </strong>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Pagado:</span>
              <strong className={`${styles.summaryValue} ${styles.paidAmount}`}>
                {formatCurrency(localPaymentData.amountPaid)}
              </strong>
            </div>
            <div className={`${styles.summaryRow} ${styles.balanceRow}`}>
              <span className={styles.summaryLabel}>Restante:</span>
              <strong
                className={`${styles.summaryValue} ${
                  balance > 0 ? styles.pendingAmount : styles.completedAmount
                }`}
              >
                {formatCurrency(balance)}
              </strong>
            </div>
            {/* Barra de Progreso */}
            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${Math.min(
                      (localPaymentData.amountPaid /
                        localPaymentData.totalPrice) *
                        100,
                      100
                    )}%`,
                  }}
                />
              </div>
              <span className={styles.progressText}>
                {Math.round(
                  (localPaymentData.amountPaid / localPaymentData.totalPrice) *
                    100
                )}
                % pagado
              </span>
            </div>
          </div>
        </div>
        <div className={styles.paymentCardActions}>
          <button onClick={onClose} className={styles.cancelButton}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className={styles.saveButton}
            disabled={!validation.isValid}
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}
