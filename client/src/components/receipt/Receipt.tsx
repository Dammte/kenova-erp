import { formatEur } from "@/lib/format";
import { FAULT_LABEL } from "@/components/orders/orderList";
import {
  DEVICE_TYPE_LABEL,
  formatDateTime,
  type OrderDetail,
  type OrderPayment,
} from "@/components/orders/orderDetail";
import { QUOTE_DAYS, clientName, receiptMoney, storeLines, type ReceiptFormat, type ReceiptStore } from "./receipt";
import styles from "./Receipt.module.css";

/**
 * Design 4 "Resguardo de depósito": what the customer takes home when leaving
 * a device. Black only (thermal printers), never the unlock code, and blank
 * legal data is left out rather than printed empty.
 */
export function Receipt({
  order,
  payments,
  store,
  format,
}: {
  order: OrderDetail;
  payments: OrderPayment[];
  store: ReceiptStore | null;
  format: ReceiptFormat;
}) {
  const money = receiptMoney(order, payments);
  const a4 = format === "a4";
  const c = order.client;
  const d = order.device;
  const faults = order.reportedFaults.map((f) => FAULT_LABEL[f] ?? f).join(", ");
  const quote = order.lines.length > 0 && !order.waivesQuote;

  return (
    <article className={`${styles.receipt} ${a4 ? styles.a4 : styles.ticket}`} aria-label="Resguardo">
      <header className={styles.head}>
        <p className={styles.brand}>Kenova</p>
        {store && <p className={styles.store}>{store.name}</p>}
        {storeLines(store, format).map((l) => (
          <p key={l} className={styles.small}>
            {l}
          </p>
        ))}
      </header>

      <div className={styles.title}>
        <p className={styles.kind}>{a4 && quote ? "Resguardo de depósito y presupuesto" : "Resguardo de depósito"}</p>
        <p className={styles.small}>Uso interno · no es factura</p>
      </div>

      <div className={styles.number}>
        <span className={styles.small}>Orden</span>
        <strong className={styles.code}>{order.code}</strong>
        <span>{formatDateTime(order.createdAt)}</span>
      </div>

      <section className={styles.section}>
        <p className={styles.label}>Cliente</p>
        <p>{clientName(c, format)}</p>
        <p>
          {[a4 && c.dni && `${c.dniType} ${c.dni}`, c.phoneNumber && `Tel. ${c.phoneNumber}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {a4 && c.email && <p>{c.email}</p>}
      </section>

      {d && (
        <section className={styles.section}>
          <p className={styles.label}>Equipo</p>
          <p>
            {DEVICE_TYPE_LABEL[d.type] ?? d.type} · {d.brand} {d.model}
          </p>
          {d.imei && <p>IMEI {d.imei}</p>}
        </section>
      )}

      <section className={styles.section}>
        <p className={styles.label}>Avería declarada</p>
        <p>{faults || "Sin indicar"}</p>
        {order.faultNotes && <p>{order.faultNotes}</p>}
        {order.physicalCondition && <p>Estado: {order.physicalCondition}</p>}
        {order.accessories && <p>Deja: {order.accessories}</p>}
      </section>

      <section className={styles.section}>
        {order.lines.length > 0 && (
          <ul className={styles.lines}>
            {order.lines.map((l) => (
              <li key={l.id}>
                <span>
                  {l.description}
                  {l.quantity > 1 && ` × ${l.quantity}`}
                </span>
                <span>{formatEur(Number(l.unitPrice) * l.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className={styles.totals}>
          <dt className={styles.strong}>Total</dt>
          <dd className={styles.strong}>{formatEur(money.total)}</dd>
          {money.paid > 0 && (
            <>
              <dt>A cuenta{money.methods.length > 0 && ` (${money.methods.join(", ").toLowerCase()})`}</dt>
              <dd>{formatEur(money.paid)}</dd>
            </>
          )}
          <dt className={styles.strong}>Pendiente</dt>
          <dd className={styles.strong}>{formatEur(money.pending)}</dd>
        </dl>
      </section>

      <section className={`${styles.section} ${styles.small}`}>
        {quote && <p>Presupuesto válido durante {QUOTE_DAYS} días desde la fecha de este resguardo.</p>}
        {order.waivesQuote && <p>El cliente renuncia al presupuesto previo.</p>}
        {store && <p>Garantía de la reparación: {store.warrantyDays} días desde la entrega.</p>}
        <p>Presenta este resguardo para recoger el equipo.</p>
        {d?.unlockSecretType && <p>Código de desbloqueo: registrado (no se imprime).</p>}
      </section>

      {a4 && <p className={`${styles.small} ${styles.foot}`}>Documento de uso interno. No es una factura.</p>}
    </article>
  );
}
