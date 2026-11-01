"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DatabaseBackup } from "lucide-react";
import { API_URL, apiFetch } from "@/lib/api";
import { STALE_DAYS, daysSince, isStale, type BackupStatus } from "./backup";
import styles from "./Backup.module.css";

/** «Hace 9 días que no se hace una copia…», or the first-copy line. */
export function reminderText(status: BackupStatus, now = Date.now()): string {
  const days = daysSince(status.lastExportAt, now);
  return days === null
    ? "Aún no se ha hecho ninguna copia de seguridad de los datos."
    : `Hace ${days} días que no se hace una copia de seguridad (se recomienda cada ${STALE_DAYS}).`;
}

/**
 * Design R2 3.13: on the partners' Panel, a warning while the last copy is
 * missing or older than STALE_DAYS. Nothing shows otherwise, or if the
 * status cannot be read.
 */
export function BackupReminder() {
  const [status, setStatus] = useState<BackupStatus | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch(`${API_URL}/backup/status`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as Partial<BackupStatus>) : null,
      )
      .then((s) => {
        // Only a real answer counts: no warning on a reply it cannot read.
        if (live && s && "lastExportAt" in s) setStatus(s as BackupStatus);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!status || !isStale(status)) return null;
  return (
    <div
      className={`${styles.reminder} ${styles.stale}`}
      role="note"
      aria-label="Copia de seguridad"
    >
      <DatabaseBackup size={18} aria-hidden />
      <p>{reminderText(status)}</p>
      <Link href="/copia-seguridad" className={styles.link}>
        Hacer copia
      </Link>
    </div>
  );
}
