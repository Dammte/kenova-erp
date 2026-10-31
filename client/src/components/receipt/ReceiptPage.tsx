"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import type { OrderDetail, OrderPayment } from "@/components/orders/orderDetail";
import { Label } from "./Label";
import { Receipt } from "./Receipt";
import type { ReceiptFormat, ReceiptStore } from "./receipt";
import styles from "./ReceiptPage.module.css";

const FORMAT_KEY = "kenova.receiptFormat";

/** The two receipts, plus the 62 × 29 mm sticker for the device. */
type PrintFormat = ReceiptFormat | "label";

const FORMATS: [PrintFormat, string][] = [
  ["ticket", "Ticket 80 mm"],
  ["a4", "A4"],
  ["label", "Etiqueta 62 × 29 mm"],
];

/** The paper the browser should use; the thermal driver sets its own length. */
const PAGE_CSS: Record<PrintFormat, string> = {
  ticket: "@page { margin: 0 4mm; }",
  a4: "@page { size: A4; margin: 15mm; }",
  label: "@page { size: 62mm 29mm; margin: 0; }",
};

/**
 * ?formato=etiqueta opens the sticker; otherwise the receipt format last used.
 * The sticker is never remembered, so «Imprimir resguardo» keeps its paper.
 */
export function readFormat(search: string): PrintFormat {
  if (new URLSearchParams(search).get("formato") === "etiqueta") return "label";
  try {
    return localStorage.getItem(FORMAT_KEY) === "a4" ? "a4" : "ticket";
  } catch {
    return "ticket";
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

interface Loaded {
  order: OrderDetail;
  payments: OrderPayment[];
  store: ReceiptStore | null;
}

/** /ordenes/:id/resguardo: the receipt alone on the page, ready to print. */
export function ReceiptPage({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [format, setFormat] = useState<PrintFormat>("ticket");
  const printRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setFormat(readFormat(window.location.search)), []);

  useEffect(() => {
    let live = true;
    const base = `${API_URL}/service-orders/${id}`;
    Promise.all([getJson<OrderDetail>(base), getJson<OrderPayment[]>(`${base}/payments`)])
      .then(async ([order, payments]) => {
        // Without the store the receipt still prints, just without its header data.
        const store = order.storeId
          ? await getJson<ReceiptStore>(`${API_URL}/stores/${order.storeId}`).catch(() => null)
          : null;
        if (live) setData({ order, payments, store });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);

  // Design 4: the focus waits on «Imprimir», so Enter prints.
  useEffect(() => {
    if (data) printRef.current?.focus();
  }, [data]);

  const choose = (f: PrintFormat) => {
    setFormat(f);
    if (f === "label") return;
    try {
      localStorage.setItem(FORMAT_KEY, f);
    } catch {
      // Only a convenience: the choice is just not remembered.
    }
  };

  return (
    <div className={styles.page}>
      <style>{PAGE_CSS[format]}</style>
      <div className={styles.toolbar}>
        <Link href={`/ordenes?orden=${id}`} className={styles.back}>
          <ArrowLeft size={16} aria-hidden /> Volver a la orden
        </Link>
        <div className={styles.formats} role="radiogroup" aria-label="Formato">
          {FORMATS.map(([f, label]) => (
            <label key={f} className={styles.format}>
              <input type="radio" name="format" checked={format === f} onChange={() => choose(f)} />
              {label}
            </label>
          ))}
        </div>
        <Button
          ref={printRef}
          variant="primary"
          icon={<Printer size={16} aria-hidden />}
          disabledReason={data ? undefined : "Cargando la orden…"}
          onClick={() => window.print()}
        >
          Imprimir
        </Button>
      </div>

      {failed ? (
        <p className={styles.error} role="alert">
          No se ha podido cargar la orden. Vuelve a la orden y prueba otra vez.
        </p>
      ) : data ? (
        <div className={`${styles.paper} ${format === "label" ? styles.labelPaper : ""}`}>
          {format === "label" ? (
            <Label order={data.order} />
          ) : (
            <Receipt order={data.order} payments={data.payments} store={data.store} format={format} />
          )}
        </div>
      ) : (
        <p className={styles.muted}>Cargando el resguardo…</p>
      )}
    </div>
  );
}
