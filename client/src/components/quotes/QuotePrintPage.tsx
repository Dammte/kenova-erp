"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import type { ReceiptStore } from "@/components/receipt/receipt";
import styles from "@/components/receipt/ReceiptPage.module.css";
import { QuoteDocument } from "./QuoteDocument";
import type { QuoteDetail } from "./quotes";

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/**
 * /presupuestos/:id/imprimir: the quote alone on an A4 page. «Imprimir» also
 * saves it as PDF from the print dialog, to attach it by hand (D7).
 */
export function QuotePrintPage({ id }: { id: string }) {
  const [data, setData] = useState<{ quote: QuoteDetail; store: ReceiptStore | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const printRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    getJson<QuoteDetail>(`${API_URL}/quotes/${id}`)
      .then(async (quote) => {
        // Without the store the document still prints, just without its header data.
        const store = await getJson<ReceiptStore>(`${API_URL}/stores/${quote.storeId}`).catch(() => null);
        if (live) setData({ quote, store });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (data) printRef.current?.focus();
  }, [data]);

  return (
    <div className={styles.page}>
      <style>{"@page { size: A4; margin: 15mm; }"}</style>
      <div className={styles.toolbar}>
        <Link href={`/presupuestos?presupuesto=${id}`} className={styles.back}>
          <ArrowLeft size={16} aria-hidden /> Volver al presupuesto
        </Link>
        <Button
          ref={printRef}
          variant="primary"
          icon={<Printer size={16} aria-hidden />}
          disabledReason={data ? undefined : "Cargando el presupuesto…"}
          onClick={() => window.print()}
        >
          Imprimir / PDF
        </Button>
      </div>
      {failed ? (
        <p className={styles.error} role="alert">
          No se ha podido cargar el presupuesto. Vuelve atrás y prueba otra vez.
        </p>
      ) : data ? (
        <div className={styles.paper}>
          <QuoteDocument quote={data.quote} store={data.store} />
        </div>
      ) : (
        <p className={styles.muted}>Cargando el presupuesto…</p>
      )}
    </div>
  );
}
