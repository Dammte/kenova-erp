"use client";

import Link from "next/link";
import { Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { formatEur } from "@/lib/format";
import { QuoteActions } from "./QuoteActions";
import { QUALITY_LABEL, QUOTE_STATUS_LABEL, formatDay, validityText, type QuoteDetail } from "./quotes";
import styles from "./Quotes.module.css";

/** Design 2.4: one quote as the client got it, with its validity and who made it. */
export function QuoteView({
  quote,
  notice,
  onEdit,
  onChanged,
  onDeleted,
}: {
  quote: QuoteDetail;
  notice?: string | null;
  onEdit: () => void;
  onChanged: (q: QuoteDetail, notice?: string) => void;
  onDeleted: () => void;
}) {
  const device = [quote.brand, quote.model].filter(Boolean).join(" ");
  return (
    <article className={styles.detail} aria-label={`Presupuesto ${quote.code}`}>
      <header className={styles.detailHead}>
        <div>
          <h2 className={styles.code}>{quote.code}</h2>
          <span className={styles.status} data-status={quote.status}>
            {QUOTE_STATUS_LABEL[quote.status]}
          </span>
        </div>
        <div className={styles.headActions}>
          <Link className={styles.textLink} href={`/presupuestos/${quote.id}/imprimir`}>
            <Printer size={16} aria-hidden /> Imprimir / PDF
          </Link>
          {quote.status === "draft" && (
            <Button variant="secondary" size="sm" icon={<Pencil size={16} aria-hidden />} onClick={onEdit}>
              Editar
            </Button>
          )}
        </div>
      </header>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {quote.order && (
        <p className={styles.notice}>
          Convertido en la orden <Link href={`/ordenes?orden=${quote.order.id}`}>{quote.order.code}</Link>.
        </p>
      )}

      <dl className={styles.facts}>
        <div>
          <dt>Cliente</dt>
          <dd>
            {quote.clientName}
            <span className={styles.muted}>{quote.clientPhone}</span>
          </dd>
        </div>
        <div>
          <dt>Dispositivo</dt>
          <dd>
            {device}
            {quote.fault && <span className={styles.muted}>{quote.fault}</span>}
          </dd>
        </div>
        <div>
          <dt>Validez</dt>
          <dd>
            {validityText(quote)}
            <span className={styles.muted}>
              Creado {formatDay(quote.createdAt)}
              {quote.createdBy && ` · ${quote.createdBy.fullName}`}
            </span>
          </dd>
        </div>
      </dl>

      <table className={styles.lines}>
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Calidad</th>
            <th scope="col" className={styles.num}>
              Importe
            </th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l, i) => (
            <tr key={l.id ?? i}>
              <td>{l.description}</td>
              <td>{l.quality ? QUALITY_LABEL[l.quality] : "—"}</td>
              <td className={styles.num}>{formatEur(l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Total
            </th>
            <td className={styles.num}>
              <strong>{formatEur(quote.total)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
      {quote.diagnosticFee && (
        <p className={styles.muted}>Si no se acepta, se cobra el diagnóstico ({formatEur(quote.diagnosticFee)}).</p>
      )}
      <QuoteActions quote={quote} onChanged={onChanged} onDeleted={onDeleted} />
    </article>
  );
}
