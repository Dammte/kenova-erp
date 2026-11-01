"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDateTime } from "@/components/orders/orderDetail";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import {
  STALE_DAYS,
  backupFileName,
  daysSince,
  isStale,
  sheetRows,
  type BackupExport,
  type BackupStatus,
} from "./backup";
import styles from "./Backup.module.css";

/** Design R2 3.13: partners only, like the menu entry. */
export function BackupPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p>
            <strong>Sin permiso.</strong> La copia de seguridad la hacen los
            socios.
          </p>
          <Link href="/panel" className={styles.link}>
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }
  return <Backup />;
}

/** «Hace 3 días», «Hoy», «Ayer». */
function ago(days: number): string {
  return days === 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`;
}

async function download(data: BackupExport) {
  // Loaded on demand: the library is large and only this button needs it.
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const table of data.tables) {
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet(sheetRows(table)),
      table.name.slice(0, 31),
    );
  }
  XLSX.writeFile(book, backupFileName(data.exportedAt));
}

function Backup() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(`${API_URL}/backup/status`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as BackupStatus;
        if (live) setStatus(body);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [reload]);

  const exportAll = async () => {
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      const res = await apiFetch(`${API_URL}/backup/export`, {
        method: "POST",
      });
      if (!res.ok) {
        setProblem(
          await errorMessage(res, "No se ha podido exportar. Reintenta."),
        );
        return;
      }
      const data = (await res.json()) as BackupExport;
      await download(data);
      const rows = data.tables.reduce((n, t) => n + t.rows.length, 0);
      setDone(
        `Descargado ${backupFileName(data.exportedAt)}: ${data.tables.length} tablas y ${rows.toLocaleString("es-ES")} registros. Guárdalo fuera de este ordenador.`,
      );
      setReload((n) => n + 1);
    } catch {
      setProblem("No se ha podido exportar. Reintenta.");
    } finally {
      setBusy(false);
    }
  };

  const days = status ? daysSince(status.lastExportAt) : null;
  const stale = status ? isStale(status) : false;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Copia de seguridad</h1>

      <section
        className={`${styles.card} ${stale ? styles.stale : ""}`}
        aria-label="Última copia"
      >
        {failed ? (
          <p className={styles.error} role="alert">
            No se ha podido consultar la última copia.{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setReload((n) => n + 1)}
            >
              Reintentar
            </button>
          </p>
        ) : !status ? (
          <p className={styles.muted}>Consultando la última copia…</p>
        ) : status.lastExportAt === null ? (
          <p>
            <strong>Aún no se ha hecho ninguna copia.</strong> Haz la primera
            ahora.
          </p>
        ) : (
          <p>
            Última copia: <strong>{formatDateTime(status.lastExportAt)}</strong>
            {status.by ? `, por ${status.by}` : ""} ({ago(days ?? 0)}).
            {stale && ` Han pasado más de ${STALE_DAYS} días: haz una nueva.`}
          </p>
        )}
      </section>

      <section className={styles.card} aria-label="Exportar">
        <p>
          Descarga un Excel con todos los datos: órdenes, clientes, equipos,
          cobros, presupuestos, stock, tarifas, tiendas, usuarios e historial,
          una hoja por tabla.
        </p>
        <p className={styles.muted}>
          No incluye contraseñas ni códigos de desbloqueo. Guarda el archivo
          fuera de este ordenador (un disco o tu nube): contiene datos
          personales de clientes.
        </p>
        <p>
          <Button
            variant="primary"
            icon={<Download size={16} aria-hidden />}
            loading={busy}
            loadingText="Exportando…"
            onClick={exportAll}
          >
            Exportar todos los datos
          </Button>
        </p>
        {problem && (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}
        {done && (
          <p className={styles.ok} role="status">
            {done}
          </p>
        )}
      </section>

      <p className={styles.muted}>
        Este Excel sirve para consultar los datos y rehacerlos a mano si hiciera
        falta. Para restaurar el sistema entero hace falta además una copia de
        la base de datos.
      </p>
    </div>
  );
}
