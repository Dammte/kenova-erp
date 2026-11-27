"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import type { OrderDetail } from "@/components/orders/orderDetail";
import { Label } from "./Label";
import pageStyles from "./ReceiptPage.module.css";
import styles from "./LabelsPage.module.css";

/** As many as the bulk endpoints accept: one page of the order list at most. */
export const MAX_LABELS = 100;

/** ?ids=a,b,c → the order ids, without blanks or repeats, in the order given. */
export function readIds(search: string): string[] {
  const raw = new URLSearchParams(search).get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_LABELS);
}

interface Loaded {
  orders: OrderDetail[];
  failed: number;
}

/**
 * /ordenes/etiquetas?ids=…: one 62 × 29 mm sticker per order, one per page,
 * so the QL-800 cuts each one. Opened from the bulk bar of the order list.
 */
export function LabelsPage() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const printRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setIds(readIds(window.location.search)), []);

  useEffect(() => {
    if (!ids) return;
    let live = true;
    Promise.allSettled(
      ids.map(async (id) => {
        const res = await apiFetch(`${API_URL}/service-orders/${id}`);
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as OrderDetail;
      }),
    ).then((results) => {
      if (!live) return;
      const orders = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      setData({ orders, failed: results.length - orders.length });
    });
    return () => {
      live = false;
    };
  }, [ids]);

  useEffect(() => {
    if (data?.orders.length) printRef.current?.focus();
  }, [data]);

  const count = data?.orders.length ?? 0;
  const waiting = !data ? "Cargando las órdenes…" : count === 0 ? "No hay etiquetas que imprimir" : undefined;

  return (
    <div className={pageStyles.page}>
      <style>{"@page { size: 62mm 29mm; margin: 0; }"}</style>
      <div className={pageStyles.toolbar}>
        <Link href="/ordenes" className={pageStyles.back}>
          <ArrowLeft size={16} aria-hidden /> Volver a órdenes
        </Link>
        {data && count > 0 && (
          <span className={styles.count}>
            {count} {count === 1 ? "etiqueta" : "etiquetas"} de 62 × 29 mm
          </span>
        )}
        <Button
          ref={printRef}
          variant="primary"
          icon={<Printer size={16} aria-hidden />}
          disabledReason={waiting}
          onClick={() => window.print()}
        >
          Imprimir
        </Button>
      </div>

      {ids && ids.length === 0 ? (
        <p className={pageStyles.error} role="alert">
          No se ha elegido ninguna orden. Vuelve a órdenes y selecciona las que quieras etiquetar.
        </p>
      ) : !data ? (
        <p className={pageStyles.muted}>Cargando las etiquetas…</p>
      ) : (
        <>
          {data.failed > 0 && (
            <p className={pageStyles.error} role="alert">
              {data.failed === 1
                ? "Una orden no se ha podido cargar y no se imprimirá."
                : `${data.failed} órdenes no se han podido cargar y no se imprimirán.`}
            </p>
          )}
          {count > 0 && (
            <ol className={styles.sheet} aria-label="Etiquetas">
              {data.orders.map((o) => (
                <li key={o.id} className={styles.one}>
                  <Label order={o} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
