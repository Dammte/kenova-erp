import { formatEur } from "@/lib/format";
import { storeLines, type ReceiptStore } from "@/components/receipt/receipt";
import styles from "@/components/receipt/Receipt.module.css";
import { QUALITY_LABEL, formatDay, type QuoteDetail } from "./quotes";

/**
 * Design 2.4 "Documento": the quote on A4, to print or save as PDF and attach
 * by hand. Same black-only look as the receipt. No signature line (decision:
 * acceptance comes by chat).
 */
export function QuoteDocument({ quote, store }: { quote: QuoteDetail; store: ReceiptStore | null }) {
  const device = [quote.brand, quote.model].filter(Boolean).join(" ");
  return (
    <article className={`${styles.receipt} ${styles.a4}`} aria-label={`Documento ${quote.code}`}>
      <header className={styles.head}>
        <p className={styles.brand}>Kenova</p>
        {store && <p className={styles.store}>{store.name}</p>}
        {storeLines(store, "a4").map((l) => (
          <p key={l} className={styles.small}>
            {l}
          </p>
        ))}
      </header>

      <div className={styles.title}>
        <p className={styles.kind}>Presupuesto</p>
        <p className={styles.small}>Uso interno · no es factura</p>
      </div>

      <div className={styles.number}>
        <span className={styles.small}>Presupuesto</span>
        <strong className={styles.code}>{quote.code}</strong>
        <span>{formatDay(quote.createdAt)}</span>
      </div>

      <section className={styles.section}>
        <p className={styles.label}>Cliente</p>
        <p>{quote.clientName}</p>
        <p>Tel. {quote.clientPhone}</p>
      </section>

      <section className={styles.section}>
        <p className={styles.label}>Equipo</p>
        <p>{device}</p>
        {quote.fault && <p>{quote.fault}</p>}
      </section>

      <section className={styles.section}>
        <ul className={styles.lines}>
          {quote.lines.map((l, i) => (
            <li key={l.id ?? i}>
              <span>
                {l.description}
                {l.quality && ` (${QUALITY_LABEL[l.quality].toLowerCase()})`}
              </span>
              <span>{formatEur(l.unitPrice)}</span>
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <dt className={styles.strong}>Total</dt>
          <dd className={styles.strong}>{formatEur(quote.total)}</dd>
        </dl>
      </section>

      <section className={`${styles.section} ${styles.small}`}>
        <p>Válido hasta el {formatDay(quote.validUntil)}.</p>
        {quote.diagnosticFee && <p>Si no se acepta, se cobra el diagnóstico ({formatEur(quote.diagnosticFee)}).</p>}
        {store && <p>Garantía de la reparación: {store.warrantyDays} días desde la entrega.</p>}
      </section>

      <p className={`${styles.small} ${styles.foot}`}>Documento de uso interno. No es una factura.</p>
    </article>
  );
}
