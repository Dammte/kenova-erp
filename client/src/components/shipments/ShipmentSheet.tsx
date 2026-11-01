"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { FAULT_LABEL } from "@/components/orders/orderList";
import { API_URL, apiFetch } from "@/lib/api";
import { formatDay, type Shipment, type ShipmentLine } from "./shipments";
import styles from "./ShipmentSheet.module.css";

/** «Pantalla rota, Batería · El táctil falla abajo», or null if none was noted. */
export function faultText(line: ShipmentLine): string | null {
  const faults = line.reportedFaults.map((f) => FAULT_LABEL[f] ?? f).join(", ");
  return [faults, line.faultNotes?.trim()].filter(Boolean).join(" · ") || null;
}

/**
 * /envios/:id/hoja (design R2 3.14): the A4 sheet that travels with the
 * devices. Each line has a box to tick on arrival and the three signatures.
 */
export function ShipmentSheet({ id }: { id: string }) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [failed, setFailed] = useState(false);
  const printRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    apiFetch(`${API_URL}/shipments/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Shipment;
        if (live) setShipment(body);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);

  // As on the receipt, the focus waits on «Imprimir», so Enter prints.
  useEffect(() => {
    if (shipment) printRef.current?.focus();
  }, [shipment]);

  const lines = shipment?.lines ?? [];

  return (
    <div className={styles.page}>
      <style>{"@page { size: A4; margin: 15mm; }"}</style>
      <div className={styles.toolbar}>
        <Link href={`/envios?envio=${id}`} className={styles.back}>
          <ArrowLeft size={16} aria-hidden /> Volver al envío
        </Link>
        <Button
          ref={printRef}
          variant="primary"
          icon={<Printer size={16} aria-hidden />}
          disabledReason={shipment ? undefined : "Cargando el envío…"}
          onClick={() => window.print()}
        >
          Imprimir
        </Button>
      </div>

      {failed ? (
        <p className={styles.error} role="alert">
          No se ha podido cargar el envío. Vuelve al envío y prueba otra vez.
        </p>
      ) : !shipment ? (
        <p className={styles.muted}>Cargando la hoja de envío…</p>
      ) : (
        <article
          className={styles.paper}
          aria-label={`Hoja de envío ${shipment.code}`}
        >
          <header className={styles.head}>
            <div>
              <p className={styles.brand}>Kenova</p>
              <h1 className={styles.title}>Hoja de envío</h1>
            </div>
            <div className={styles.headRight}>
              <p className={styles.code}>{shipment.code}</p>
              <p>
                {shipment.fromStore.name} → {shipment.toStore.name} ·{" "}
                {formatDay(shipment.createdAt)}
              </p>
            </div>
          </header>

          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" aria-label="Recibido">
                  ✓
                </th>
                <th scope="col">Orden</th>
                <th scope="col">Cliente</th>
                <th scope="col">Equipo</th>
                <th scope="col">Avería</th>
                <th scope="col">Acces.</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.orderId}>
                  <td className={styles.box} aria-hidden>
                    ☐
                  </td>
                  <td className={styles.mono}>{l.orderCode}</td>
                  <td>{l.clientName || "—"}</td>
                  <td>{l.device ?? "—"}</td>
                  <td className={faultText(l) ? styles.fault : undefined}>
                    {faultText(l) ?? "Sin indicar"}
                  </td>
                  <td>{l.accessories || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className={styles.note}>
            {lines.length} {lines.length === 1 ? "equipo" : "equipos"}. Cada
            equipo va en su bolsa con la etiqueta de 62 mm.
          </p>
          {shipment.carrier && (
            <p className={styles.note}>Transporta: {shipment.carrier}</p>
          )}

          <div className={styles.signatures}>
            <div>Entrega · {shipment.fromStore.name}</div>
            <div>Transporta · nombre y firma</div>
            <div>Recibe · {shipment.toStore.name}</div>
          </div>

          <p className={styles.footer}>
            Documento interno · no válido como factura
          </p>
        </article>
      )}
    </div>
  );
}
