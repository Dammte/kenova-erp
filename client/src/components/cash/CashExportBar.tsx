"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
import styles from "./Cash.module.css";

/**
 * «Imprimir» and «Exportar a Excel» of what is on screen (design 3.2). The
 * rows are built only when asked for, with the filter applied.
 */
export function CashExportBar({
  rows,
  sheet,
  fileName,
  cols,
}: {
  rows: () => (string | number)[][];
  sheet: string;
  fileName: string;
  /** Column widths, in characters. */
  cols: number[];
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const exportXlsx = async () => {
    setBusy(true);
    setProblem(null);
    try {
      // Loaded on demand: the library is large and only this button needs it.
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(rows());
      ws["!cols"] = cols.map((wch) => ({ wch }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, ws, sheet.slice(0, 31));
      XLSX.writeFile(book, fileName);
    } catch {
      setProblem("No se ha podido crear el Excel. Reintenta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${styles.exportBar} ${styles.noPrint}`}>
      <Button
        variant="ghost"
        size="sm"
        icon={<Printer size={16} aria-hidden />}
        onClick={() => window.print()}
      >
        Imprimir
      </Button>
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        loadingText="Preparando…"
        onClick={exportXlsx}
      >
        Exportar a Excel
      </Button>
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
