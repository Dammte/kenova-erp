import { FAULT_LABEL } from "@/components/orders/orderList";
import type { OrderDetail } from "@/components/orders/orderDetail";
import { Code128 } from "./code128";
import { clientName } from "./receipt";
import styles from "./Label.module.css";

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });

/**
 * The sticker that goes on the device or its bag: 62 × 29 mm (Brother DK-11209).
 * The code is large to read from a shelf and the barcode lets the global search
 * find the order with a scanner. Never the unlock code, never prices.
 */
export function Label({ order }: { order: OrderDetail }) {
  const d = order.device;
  const c = order.client;
  const fault = order.reportedFaults.map((f) => FAULT_LABEL[f] ?? f).join(", ");
  const device = d ? `${d.brand} ${d.model}`.trim() : "";
  return (
    <article className={styles.label} aria-label="Etiqueta">
      <div className={styles.top}>
        <strong className={styles.code}>{order.code}</strong>
        <span className={styles.date}>{shortDate.format(new Date(order.createdAt))}</span>
      </div>
      <Code128 value={order.code} height={30} className={styles.barcode} />
      <p className={styles.line}>{[device, fault].filter(Boolean).join(" · ") || "Sin datos del equipo"}</p>
      <p className={styles.line}>{[clientName(c, "ticket"), c.phoneNumber].filter(Boolean).join(" · ")}</p>
    </article>
  );
}
