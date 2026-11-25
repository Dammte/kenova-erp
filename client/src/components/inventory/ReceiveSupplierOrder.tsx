"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import type { SupplierOrder } from "@/components/suppliers/orders";
import { InvoiceImport, type FromOrder } from "./InvoiceImport";
import styles from "./Inventory.module.css";

/** The supplier order's lines as «Importar factura» reads them. */
export function receiptFrom(order: SupplierOrder): FromOrder {
  return {
    orderId: order.id,
    head: { provider: order.supplier.name.slice(0, 50), number: order.reference, invoiceDate: order.orderDate },
    lines: (order.lines ?? []).map((l) => ({
      description: l.description,
      ref: l.ref,
      quantity: l.quantity,
      // A price the page did not show is typed in «Revisar».
      unitCost: l.unitPrice ?? "0",
    })),
  };
}

/** «Revisar y recibir» a supplier order: the usual review, with its lines and the visto bueno. */
export function ReceiveSupplierOrder({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch(`${API_URL}/supplier-orders/${orderId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res, "No se ha podido cargar el pedido del proveedor."));
        const found = (await res.json()) as SupplierOrder;
        if (!live) return;
        if (found.state !== "PENDIENTE") setProblem(`El pedido ${found.reference} no está pendiente de recibir.`);
        else if (!found.lines?.length) setProblem(`El pedido ${found.reference} no tiene líneas: léelas antes en su ficha.`);
        else setOrder(found);
      })
      .catch((e: Error) => live && setProblem(e.message || "No se ha podido cargar el pedido del proveedor."));
    return () => {
      live = false;
    };
  }, [orderId]);

  if (problem) {
    return (
      <div className={styles.importCard}>
        <div role="alert" className={styles.error}>
          {problem}
        </div>
        <Link href={`/proveedores/pedidos?pedido=${orderId}`} className={styles.link}>
          Volver al pedido
        </Link>
      </div>
    );
  }
  if (!order) return <p className={styles.muted}>Cargando el pedido del proveedor…</p>;
  return <InvoiceImport onDone={onDone} fromOrder={receiptFrom(order)} />;
}
