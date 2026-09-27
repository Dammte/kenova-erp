import React from "react";
import { Clock, Wrench, AlertTriangle, CheckCircle, Ban } from "lucide-react";
import { ServiceStatus } from "../types";

export const getStatusIcon = (status: string): React.ReactElement => {
  switch (status) {
    case ServiceStatus.PENDIENTE_CLIENTE:
      return <Clock size={12} />;
    case ServiceStatus.EN_PROGRESO:
      return <Wrench size={12} />;
    case ServiceStatus.PENDIENTE_PIEZAS:
      return <AlertTriangle size={12} />;
    case ServiceStatus.FINALIZADO:
      return <CheckCircle size={12} />;
    case ServiceStatus.ENTREGADO:
      return <CheckCircle size={12} />;
    case ServiceStatus.CANCELADO:
      return <Ban size={12} />;
    default:
      return <Clock size={12} />;
  }
};

export const getPaymentStatusIcon = (paymentStatus: string): React.ReactElement => {
  const icons: Record<string, React.ReactElement> = {
    paid: <CheckCircle size={12} />,
    paid_partial: <Clock size={12} />,
    pending: <AlertTriangle size={12} />,
    overdue: <AlertTriangle size={12} />,
  };
  return icons[paymentStatus] ?? <Clock size={12} />;
};
