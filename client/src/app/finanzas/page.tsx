"use client";

import { API_URL, apiFetch } from "@/lib/api";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp, Download, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, Loader2, Clock, Receipt, FileText, Calendar,
  CheckCircle2,
} from "lucide-react";
import styles from "./page.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const API = API_URL;
const IVA_RATE = 0.21;

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const QUARTERS = [
  { id: 0, tag: "T1", long: "T1 — Ene/Feb/Mar", months: [0,1,2] },
  { id: 1, tag: "T2", long: "T2 — Abr/May/Jun", months: [3,4,5] },
  { id: 2, tag: "T3", long: "T3 — Jul/Ago/Sep", months: [6,7,8] },
  { id: 3, tag: "T4", long: "T4 — Oct/Nov/Dic", months: [9,10,11] },
];

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo", card: "Tarjeta",
  transfer: "Transferencia", other: "Otro",
};

type PeriodKind = "month" | "quarter" | "year" | "custom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinOrder {
  id: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  totalPrice?: number | string;
  amountPaid?: number | string;
  balance?: number | string;
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
  client?: { firstName?: string; lastName?: string } | null;
  device?: { brand?: string; model?: string; type?: string } | null;
  services?: { name?: string; price?: number | string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v: number | string | undefined | null): number => Number(v ?? 0) || 0;

const fEur = (v: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR", minimumFractionDigits: 2,
  }).format(v);

const fDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });

const fDateLong = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric", month: "long", year: "numeric",
  });

const clientName = (o: FinOrder): string => {
  const f = o.client?.firstName ?? "", l = o.client?.lastName ?? "";
  if (!f && !l) return "—";
  return l ? `${l}, ${f}` : f;
};

const daysAgo = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const netoOf  = (bruto: number) => bruto / (1 + IVA_RATE);
const ivaOf   = (bruto: number) => bruto * IVA_RATE / (1 + IVA_RATE);

function getPeriodRange(
  kind: PeriodKind, year: number, quarter: number,
  customFrom?: string, customTo?: string,
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  switch (kind) {
    case "month": {
      const m = now.getMonth();
      return { from: new Date(year, m, 1), to: new Date(year, m + 1, 1), label: `${MONTHS[m]} ${year}` };
    }
    case "quarter": {
      const q = QUARTERS[quarter];
      return {
        from: new Date(year, q.months[0], 1),
        to:   new Date(year, q.months[2] + 1, 1),
        label: `${q.long} ${year}`,
      };
    }
    case "year":
      return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1), label: `Ejercicio ${year}` };
    case "custom": {
      const f = customFrom ? new Date(customFrom) : new Date(0);
      const t = customTo ? new Date(new Date(customTo).getTime() + 86_400_000) : tomorrow;
      const fmt = (d: Date) =>
        d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
      return { from: f, to: t, label: `${fmt(f)} – ${fmt(t)}` };
    }
  }
}

function isRevenue(o: FinOrder, from: Date, to: Date): boolean {
  const d = new Date(o.updatedAt ?? o.createdAt);
  return o.status === "entregado" && d >= from && d < to;
}

function getMonthBreakdown(orders: FinOrder[]) {
  const map: Record<number, { month: number; year: number; count: number; bruto: number }> = {};
  orders.forEach(o => {
    const d = new Date(o.updatedAt ?? o.createdAt);
    const key = d.getFullYear() * 100 + d.getMonth();
    if (!map[key]) map[key] = { month: d.getMonth(), year: d.getFullYear(), count: 0, bruto: 0 };
    map[key].count++;
    map[key].bruto += n(o.totalPrice);
  });
  return Object.values(map).sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
}

// ─── PDF Generators ───────────────────────────────────────────────────────────

const PRINT_BASE = `
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;background:#fff;padding:22mm 25mm 18mm}
.lh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:18px}
.brand{font-size:16pt;font-weight:900;letter-spacing:-0.5px}
.brand-sub{font-size:8pt;color:#666;margin-top:2px}
.doc-meta{text-align:right;font-size:8.5pt;color:#444;line-height:1.7}
.doc-title{font-size:13pt;font-weight:700;margin-bottom:2px;color:#111}
.sec{margin:18px 0 8px;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#666;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:9.5pt;font-variant-numeric:tabular-nums}
th{font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#555;padding:5px 8px;text-align:left;border-bottom:1px solid #ddd;font-weight:700}
td{padding:5px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle}
.r{text-align:right}.l{text-align:left}
.mono{font-family:'Courier New',Courier,monospace;font-size:8pt;color:#666}
.bold{font-weight:700}
.total-row td{border-top:2px solid #111;border-bottom:3px double #111;font-weight:700;padding:6px 8px}
.subtotal-row td{border-top:1px solid #bbb;font-weight:600;background:#f8f8f8}
.line{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:10pt}
.line-label{color:#333}
.line-val{font-weight:700;font-variant-numeric:tabular-nums;text-align:right;min-width:110px}
.line-val.green{color:#0d6b4f}
.line-val.purple{color:#5b21b6}
.line-val.amber{color:#92400e}
.line-indent{padding-left:16px;font-size:9.5pt;color:#555}
.divider{border:none;border-top:1px solid #ddd;margin:8px 0}
.double-divider{border:none;border-top:3px double #111;margin:8px 0}
.nota{font-size:8pt;color:#666;margin-top:20px;padding:10px;border:1px solid #ddd;border-radius:4px;line-height:1.6}
.nota strong{color:#444}
.ft{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:10px;display:flex;justify-content:space-between;font-size:7.5pt;color:#999}
.aging-normal{background:#fff}
.aging-warn{background:#fffbeb}
.aging-risk{background:#fff7ed}
.aging-danger{background:#fef2f2}
@media print{body{padding:0}@page{margin:18mm 22mm}}
</style>`;

const LETTERHEAD = (title: string, period: string, generated: string) => `
<div class="lh">
  <div>
    <div class="brand">2InSide</div>
    <div class="brand-sub">Servicio Técnico Especializado</div>
  </div>
  <div class="doc-meta">
    <div class="doc-title">${title}</div>
    <div>Período: ${period}</div>
    <div>Generado: ${generated}</div>
  </div>
</div>`;

function openPrint(html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>2InSide — Informe</title>${PRINT_BASE}</head><body>${html}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

function pdfPL(revenue: FinOrder[], period: string) {
  const bruto   = revenue.reduce((s, o) => s + n(o.totalPrice), 0);
  const cobrado = revenue.reduce((s, o) => s + n(o.amountPaid), 0);
  const iva     = ivaOf(bruto);
  const neto    = netoOf(bruto);
  const tasa    = bruto > 0 ? (cobrado / bruto * 100) : 0;
  const byM: Record<string, number> = {};
  revenue.forEach(o => { const k = o.paymentMethod ?? "other"; byM[k] = (byM[k] ?? 0) + n(o.totalPrice); });

  const gen = fDateLong(new Date().toISOString());
  const html = `
${LETTERHEAD("CUENTA DE RESULTADOS", period, gen)}

<div class="sec">Ingresos del período — ${revenue.length} orden${revenue.length !== 1 ? "es" : ""} entregada${revenue.length !== 1 ? "s" : ""}</div>
<div style="padding:2px 0">
  <div class="line"><span class="line-label">Facturación por servicios prestados</span><span class="line-val green">${fEur(bruto)}</span></div>
  <hr class="divider">
  <div class="line"><span class="line-label bold">Total ingresos brutos</span><span class="line-val green bold">${fEur(bruto)}</span></div>
</div>

<div class="sec">Desglose IVA repercutido (21 %)</div>
<div style="padding:2px 0">
  <div class="line line-indent"><span class="line-label">Base imponible</span><span class="line-val">${fEur(neto)}</span></div>
  <div class="line line-indent"><span class="line-label">Cuota IVA (21 %)</span><span class="line-val purple">${fEur(iva)}</span></div>
  <hr class="double-divider">
  <div class="line"><span class="line-label bold">Base imponible neta</span><span class="line-val bold">${fEur(neto)}</span></div>
</div>

<div class="sec">Cobros realizados</div>
<div style="padding:2px 0">
  <div class="line"><span class="line-label">Importe total cobrado</span><span class="line-val green">${fEur(cobrado)}</span></div>
  <div class="line"><span class="line-label">Saldo pendiente de cobro</span><span class="line-val amber">${fEur(bruto - cobrado)}</span></div>
  <div class="line"><span class="line-label">Tasa de cobro</span><span class="line-val">${tasa.toFixed(1)} %</span></div>
  <div class="line"><span class="line-label">Ticket medio</span><span class="line-val">${revenue.length > 0 ? fEur(bruto / revenue.length) : "—"}</span></div>
</div>

${Object.keys(byM).length > 0 ? `
<div class="sec">Desglose por método de pago</div>
<table>
  <thead><tr><th>Método</th><th class="r">Importe</th><th class="r">%</th></tr></thead>
  <tbody>
  ${Object.entries(byM).map(([k, v]) => `
    <tr><td>${METHOD_LABELS[k] ?? k}</td>
    <td class="r">${fEur(v)}</td>
    <td class="r">${bruto > 0 ? (v/bruto*100).toFixed(1) : "0,0"} %</td></tr>`).join("")}
  </tbody>
  <tfoot><tr class="subtotal-row"><td class="bold">Total</td><td class="r bold">${fEur(bruto)}</td><td class="r bold">100,0 %</td></tr></tfoot>
</table>` : ""}

<div class="ft"><span>2InSide Servicio Técnico — Cuenta de Resultados</span><span>${gen}</span></div>`;
  openPrint(html);
}

function pdfLedger(revenue: FinOrder[], period: string) {
  const bruto = revenue.reduce((s, o) => s + n(o.totalPrice), 0);
  const gen = fDateLong(new Date().toISOString());
  const sorted = [...revenue].sort(
    (a, b) => new Date(a.updatedAt ?? a.createdAt).getTime() - new Date(b.updatedAt ?? b.createdAt).getTime(),
  );
  const html = `
${LETTERHEAD("LIBRO DE INGRESOS", period, gen)}

<table>
  <thead>
    <tr>
      <th>N.º</th><th>Fecha</th><th>Referencia</th><th>Cliente</th>
      <th class="r">Base Imp.</th><th class="r">IVA 21 %</th><th class="r">Total</th><th>Método</th>
    </tr>
  </thead>
  <tbody>
    ${sorted.map((o, i) => {
      const total = n(o.totalPrice);
      return `<tr>
        <td class="mono">${String(i + 1).padStart(3, "0")}</td>
        <td>${fDate(o.updatedAt ?? o.createdAt)}</td>
        <td class="mono">#${o.id.substring(0, 8)}</td>
        <td>${clientName(o)}</td>
        <td class="r">${fEur(netoOf(total))}</td>
        <td class="r">${fEur(ivaOf(total))}</td>
        <td class="r bold">${fEur(total)}</td>
        <td>${METHOD_LABELS[o.paymentMethod ?? ""] ?? "—"}</td>
      </tr>`;
    }).join("")}
  </tbody>
  <tfoot>
    <tr class="total-row">
      <td colspan="4" class="bold">TOTALES (${sorted.length} operaciones)</td>
      <td class="r bold">${fEur(netoOf(bruto))}</td>
      <td class="r bold">${fEur(ivaOf(bruto))}</td>
      <td class="r bold">${fEur(bruto)}</td>
      <td></td>
    </tr>
  </tfoot>
</table>
<div class="ft"><span>2InSide Servicio Técnico — Libro de Ingresos</span><span>${gen}</span></div>`;
  openPrint(html);
}

function pdfVAT(revenue: FinOrder[], period: string) {
  const breakdown = getMonthBreakdown(revenue);
  const totalBruto = revenue.reduce((s, o) => s + n(o.totalPrice), 0);
  const gen = fDateLong(new Date().toISOString());
  const html = `
${LETTERHEAD("INFORME IVA REPERCUTIDO — REF. MODELO 303", period, gen)}

<div class="sec">Operaciones gravadas al tipo general — 21 %</div>
<table>
  <thead>
    <tr><th>Mes</th><th class="r">N.º Ops.</th><th class="r">Base Imponible</th><th class="r">Cuota IVA (21 %)</th><th class="r">Total Facturado</th></tr>
  </thead>
  <tbody>
    ${breakdown.map(row => `<tr>
      <td>${MONTHS[row.month]} ${row.year}</td>
      <td class="r">${row.count}</td>
      <td class="r">${fEur(netoOf(row.bruto))}</td>
      <td class="r">${fEur(ivaOf(row.bruto))}</td>
      <td class="r bold">${fEur(row.bruto)}</td>
    </tr>`).join("")}
  </tbody>
  <tfoot>
    <tr class="total-row">
      <td class="bold">TOTAL PERÍODO</td>
      <td class="r bold">${revenue.length}</td>
      <td class="r bold">${fEur(netoOf(totalBruto))}</td>
      <td class="r bold">${fEur(ivaOf(totalBruto))}</td>
      <td class="r bold">${fEur(totalBruto)}</td>
    </tr>
  </tfoot>
</table>

<div class="sec">Resumen para declaración trimestral</div>
<div style="padding:2px 0">
  <div class="line"><span class="line-label">Base imponible total (casilla 01)</span><span class="line-val">${fEur(netoOf(totalBruto))}</span></div>
  <div class="line"><span class="line-label">Cuota IVA devengada (casilla 03)</span><span class="line-val purple bold">${fEur(ivaOf(totalBruto))}</span></div>
</div>

<div class="nota">
  <strong>Aviso legal:</strong> Este informe es de carácter orientativo y se basa únicamente en las órdenes marcadas como
  "Entregado" en el período indicado. Los importes deben contrastarse con la contabilidad oficial antes de su presentación.
  Consulte con su asesor fiscal o gestor para la correcta cumplimentación del Modelo 303.
</div>
<div class="ft"><span>2InSide Servicio Técnico — Informe IVA</span><span>${gen}</span></div>`;
  openPrint(html);
}

function pdfAging(pending: FinOrder[]) {
  const total = pending.reduce((s, o) => s + n(o.balance), 0);
  const gen = fDateLong(new Date().toISOString());
  const sorted = [...pending].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const agingClass = (days: number) => {
    if (days < 15) return "aging-normal";
    if (days < 30) return "aging-warn";
    if (days < 60) return "aging-risk";
    return "aging-danger";
  };
  const agingLabel = (days: number) => {
    if (days < 15) return "";
    if (days < 30) return "⚠";
    if (days < 60) return "▲";
    return "●";
  };

  const bkt = { lt15: 0, lt30: 0, lt60: 0, ge60: 0 };
  pending.forEach(o => {
    const d = daysAgo(o.createdAt);
    if (d < 15) bkt.lt15 += n(o.balance);
    else if (d < 30) bkt.lt30 += n(o.balance);
    else if (d < 60) bkt.lt60 += n(o.balance);
    else bkt.ge60 += n(o.balance);
  });

  const html = `
${LETTERHEAD("AGING DE CUENTAS POR COBRAR", `A fecha ${gen}`, gen)}

<div class="sec">Análisis de antigüedad de saldos — ${pending.length} orden${pending.length !== 1 ? "es" : ""}</div>
<table>
  <thead>
    <tr><th>Ref.</th><th>Cliente</th><th>Dispositivo</th><th class="r">Total</th><th class="r">Cobrado</th><th class="r">Saldo</th><th class="r">Días</th><th></th></tr>
  </thead>
  <tbody>
    ${sorted.map(o => {
      const days = daysAgo(o.createdAt);
      return `<tr class="${agingClass(days)}">
        <td class="mono">#${o.id.substring(0, 8)}</td>
        <td>${clientName(o)}</td>
        <td>${o.device ? [o.device.brand, o.device.model].filter(Boolean).join(" ") || o.device.type || "—" : "—"}</td>
        <td class="r">${fEur(n(o.totalPrice))}</td>
        <td class="r">${fEur(n(o.amountPaid))}</td>
        <td class="r bold">${fEur(n(o.balance))}</td>
        <td class="r">${days}d</td>
        <td style="text-align:center">${agingLabel(days)}</td>
      </tr>`;
    }).join("")}
  </tbody>
  <tfoot>
    <tr class="total-row"><td colspan="5" class="bold">TOTAL PENDIENTE</td>
    <td class="r bold">${fEur(total)}</td><td colspan="2"></td></tr>
  </tfoot>
</table>

<div class="sec">Distribución por antigüedad</div>
<table style="width:auto;min-width:380px">
  <thead><tr><th>Tramo</th><th class="r">Importe</th><th class="r">%</th></tr></thead>
  <tbody>
    <tr class="aging-normal"><td>0 – 14 días</td><td class="r">${fEur(bkt.lt15)}</td><td class="r">${total>0?(bkt.lt15/total*100).toFixed(0):0} %</td></tr>
    <tr class="aging-warn"><td>15 – 29 días ⚠</td><td class="r">${fEur(bkt.lt30)}</td><td class="r">${total>0?(bkt.lt30/total*100).toFixed(0):0} %</td></tr>
    <tr class="aging-risk"><td>30 – 59 días ▲</td><td class="r">${fEur(bkt.lt60)}</td><td class="r">${total>0?(bkt.lt60/total*100).toFixed(0):0} %</td></tr>
    <tr class="aging-danger"><td>60+ días ●</td><td class="r">${fEur(bkt.ge60)}</td><td class="r">${total>0?(bkt.ge60/total*100).toFixed(0):0} %</td></tr>
  </tbody>
  <tfoot><tr class="subtotal-row"><td class="bold">Total</td><td class="r bold">${fEur(total)}</td><td class="r bold">100 %</td></tr></tfoot>
</table>
<div class="ft"><span>2InSide Servicio Técnico — Aging de Cobros</span><span>${gen}</span></div>`;
  openPrint(html);
}

// ─── Expandable Report Card ───────────────────────────────────────────────────

interface ReportCardProps {
  title: string;
  description: string;
  accent: string;
  accentBg: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  keyFigure: string;
  keyLabel: string;
  empty?: boolean;
  emptyMsg?: string;
  onDownload: () => void;
  downloadLabel?: string;
  children: React.ReactNode;
}

function ReportCard({
  title, description, accent, accentBg, icon: Icon,
  keyFigure, keyLabel, empty, emptyMsg, onDownload,
  downloadLabel = "Descargar PDF", children,
}: ReportCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.rCard} style={{ "--accent": accent } as React.CSSProperties}>
      <div className={styles.rStripe} />

      <div className={styles.rHeader}>
        <div className={styles.rLeft}>
          <div className={styles.rIconWrap} style={{ background: accentBg }}>
            <Icon size={15} color={accent} />
          </div>
          <div className={styles.rTitleBlock}>
            <span className={styles.rTitle}>{title}</span>
            <span className={styles.rDesc}>{description}</span>
          </div>
        </div>

        <div className={styles.rRight}>
          <div className={styles.rFigBlock}>
            <span className={styles.rFig} style={{ color: accent }}>{keyFigure}</span>
            <span className={styles.rFigLabel}>{keyLabel}</span>
          </div>
        </div>
      </div>

      <div className={styles.rActions}>
        {!empty && (
          <button
            className={styles.expandBtn}
            onClick={() => setOpen(v => !v)}
          >
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {open ? "Ocultar detalle" : "Ver detalle"}
          </button>
        )}
        {empty && <span className={styles.emptyNote}>{emptyMsg}</span>}
        <button
          className={styles.dlBtn}
          onClick={onDownload}
          disabled={!!empty}
        >
          <Download size={13} />
          {downloadLabel}
        </button>
      </div>

      {open && !empty && (
        <div className={styles.rBody}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_Q    = Math.floor(new Date().getMonth() / 3);

export default function FinanzasPage() {
  const [kind,       setKind]       = useState<PeriodKind>("month");
  const [selYear,    setSelYear]    = useState(CURRENT_YEAR);
  const [selQ,       setSelQ]       = useState(CURRENT_Q);
  const [customFrom, setFrom]       = useState("");
  const [customTo,   setTo]         = useState("");
  const [orders,     setOrders]     = useState<FinOrder[] | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [spinning,   setSpinning]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    setSpinning(true); setError(null);
    try {
      const r = await apiFetch(`${API}/service-orders`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setOrders(Array.isArray(d) ? d : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setOrders([]);
    } finally { setLoading(false); setSpinning(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const period = useMemo(
    () => getPeriodRange(kind, selYear, selQ, customFrom, customTo),
    [kind, selYear, selQ, customFrom, customTo],
  );

  const revenue = useMemo(
    () => (orders ?? []).filter(o => isRevenue(o, period.from, period.to)),
    [orders, period],
  );

  const pending = useMemo(
    () => (orders ?? []).filter(o => o.status !== "entregado" && o.status !== "cancelado" && n(o.balance) > 0),
    [orders],
  );

  const bruto    = useMemo(() => revenue.reduce((s, o) => s + n(o.totalPrice), 0), [revenue]);
  const ivaTotal = useMemo(() => ivaOf(bruto), [bruto]);
  const netoTotal= useMemo(() => netoOf(bruto), [bruto]);
  const cobrado  = useMemo(() => revenue.reduce((s, o) => s + n(o.amountPaid), 0), [revenue]);
  const pendTotal= useMemo(() => pending.reduce((s, o) => s + n(o.balance), 0), [pending]);
  const tasa     = bruto > 0 ? cobrado / bruto * 100 : 0;

  const monthBreakdown = useMemo(() => getMonthBreakdown(revenue), [revenue]);

  if (loading) return (
    <div className={styles.center}>
      <Loader2 size={24} className={styles.spin} />
      <span>Cargando datos contables…</span>
    </div>
  );

  const yearOptions = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

  return (
    <div className={styles.root}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.hLeft}>
          <div className={styles.hIcon}>
            <TrendingUp size={18} />
          </div>
          <div>
            <h1 className={styles.hTitle}>Informes Financieros</h1>
            <p className={styles.hSub}>Generación y descarga de documentos contables</p>
          </div>
        </div>
        <div className={styles.hRight}>
          <select
            className={styles.yearSel}
            value={selYear}
            onChange={e => setSelYear(Number(e.target.value))}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            className={`${styles.refreshBtn} ${spinning ? styles.spin : ""}`}
            onClick={load}
            title="Actualizar"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* ── Period Selector ──────────────────────────────────────── */}
      <div className={styles.periodBlock}>
        <div className={styles.kindBar}>
          {([
            ["month",   "Mes actual"],
            ["quarter", "Trimestre"],
            ["year",    "Ejercicio"],
            ["custom",  "Personalizado"],
          ] as [PeriodKind, string][]).map(([k, lbl]) => (
            <button
              key={k}
              className={`${styles.kindBtn} ${kind === k ? styles.kindActive : ""}`}
              onClick={() => setKind(k)}
            >{lbl}</button>
          ))}
        </div>

        {kind === "quarter" && (
          <div className={styles.qBar}>
            {QUARTERS.map(q => (
              <button
                key={q.id}
                className={`${styles.qBtn} ${selQ === q.id ? styles.qActive : ""}`}
                onClick={() => setSelQ(q.id)}
              >
                <span className={styles.qTag}>{q.tag}</span>
                <span className={styles.qLong}>{q.long}</span>
              </button>
            ))}
          </div>
        )}

        {kind === "custom" && (
          <div className={styles.customRange}>
            <label className={styles.rangeLabel}>Desde</label>
            <input type="date" className={styles.dateIn} value={customFrom} onChange={e => setFrom(e.target.value)} />
            <span className={styles.rangeSep}>hasta</span>
            <input type="date" className={styles.dateIn} value={customTo} onChange={e => setTo(e.target.value)} />
          </div>
        )}

        <div className={styles.periodBadge}>
          <Calendar size={11} />
          {period.label}
        </div>
      </div>

      {error && (
        <div className={styles.errBanner}>
          <AlertTriangle size={12} />{error}
          <button onClick={load}>Reintentar</button>
        </div>
      )}

      {/* ── Accounting Summary Strip ─────────────────────────────── */}
      <div className={styles.strip}>
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>Base imponible neta</span>
          <span className={styles.stripValue} style={{ color: "#0f766e" }}>{fEur(netoTotal)}</span>
          <span className={styles.stripSub}>{revenue.length} órdenes · período</span>
        </div>
        <div className={styles.stripDivider} />
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>IVA repercutido 21 %</span>
          <span className={styles.stripValue} style={{ color: "#6d28d9" }}>{fEur(ivaTotal)}</span>
          <span className={styles.stripSub}>sobre {fEur(bruto)} facturado</span>
        </div>
        <div className={styles.stripDivider} />
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>Saldo pendiente de cobro</span>
          <span className={styles.stripValue} style={{ color: pending.length > 0 ? "#b45309" : "#0f766e" }}>{fEur(pendTotal)}</span>
          <span className={styles.stripSub}>{pending.length} orden{pending.length !== 1 ? "es" : ""} activa{pending.length !== 1 ? "s" : ""}</span>
        </div>
        <div className={styles.stripDivider} />
        <div className={styles.stripItem}>
          <span className={styles.stripLabel}>Tasa de cobro</span>
          <span className={styles.stripValue} style={{ color: tasa >= 90 ? "#0f766e" : tasa >= 60 ? "#b45309" : "#b91c1c" }}>
            {bruto > 0 ? `${tasa.toFixed(1)} %` : "—"}
          </span>
          <span className={styles.stripSub}>cobrado vs. facturado</span>
        </div>
      </div>

      {/* ── Report Cards ─────────────────────────────────────────── */}

      {/* 1. Cuenta de Resultados */}
      <ReportCard
        title="Cuenta de Resultados"
        description="Estado de pérdidas y ganancias del período seleccionado con desglose de IVA"
        accent="#0f766e" accentBg="#f0fdf9"
        icon={TrendingUp}
        keyFigure={fEur(netoTotal)}
        keyLabel="base imponible neta"
        empty={revenue.length === 0}
        emptyMsg="Sin órdenes entregadas en el período"
        onDownload={() => pdfPL(revenue, period.label)}
        downloadLabel="Descargar P&L"
      >
        <div className={styles.stmtGrid}>
          <div className={styles.stmtCol}>
            <p className={styles.stmtHead}>Ingresos</p>
            <div className={styles.stmtRow}>
              <span>Servicios prestados</span><span className={styles.stmtAmt}>{fEur(bruto)}</span>
            </div>
            <div className={`${styles.stmtRow} ${styles.stmtTotal}`}>
              <span>Total bruto</span><span className={styles.stmtAmt} style={{ color: "#0f766e" }}>{fEur(bruto)}</span>
            </div>
            <p className={styles.stmtHead} style={{ marginTop: 16 }}>IVA repercutido</p>
            <div className={styles.stmtRow}>
              <span>Base imponible</span><span className={styles.stmtAmt}>{fEur(netoTotal)}</span>
            </div>
            <div className={styles.stmtRow}>
              <span>Cuota IVA (21 %)</span><span className={styles.stmtAmt} style={{ color: "#6d28d9" }}>{fEur(ivaTotal)}</span>
            </div>
            <div className={`${styles.stmtRow} ${styles.stmtDouble}`}>
              <span>Base imponible neta</span><span className={styles.stmtAmt} style={{ color: "#0f766e", fontWeight: 800 }}>{fEur(netoTotal)}</span>
            </div>
          </div>

          <div className={styles.stmtCol}>
            <p className={styles.stmtHead}>Cobros</p>
            <div className={styles.stmtRow}>
              <span>Importe cobrado</span><span className={styles.stmtAmt} style={{ color: "#0f766e" }}>{fEur(cobrado)}</span>
            </div>
            <div className={styles.stmtRow}>
              <span>Pendiente de cobro</span><span className={styles.stmtAmt} style={{ color: "#b45309" }}>{fEur(bruto - cobrado)}</span>
            </div>
            <div className={styles.stmtRow}>
              <span>Tasa de cobro</span><span className={styles.stmtAmt}>{bruto > 0 ? `${tasa.toFixed(1)} %` : "—"}</span>
            </div>
            <div className={styles.stmtRow}>
              <span>Ticket medio</span><span className={styles.stmtAmt}>{revenue.length > 0 ? fEur(bruto / revenue.length) : "—"}</span>
            </div>
            <p className={styles.stmtHead} style={{ marginTop: 16 }}>Por método de pago</p>
            {(() => {
              const byM: Record<string, number> = {};
              revenue.forEach(o => { const k = o.paymentMethod ?? "other"; byM[k] = (byM[k] ?? 0) + n(o.totalPrice); });
              return Object.entries(byM).map(([k, v]) => (
                <div key={k} className={styles.stmtRow}>
                  <span>{METHOD_LABELS[k] ?? k}</span>
                  <span className={styles.stmtAmt}>{fEur(v)}<span className={styles.stmtPct}>&nbsp;({bruto > 0 ? (v/bruto*100).toFixed(0) : 0}%)</span></span>
                </div>
              ));
            })()}
          </div>
        </div>
      </ReportCard>

      {/* 2. Libro de Ingresos */}
      <ReportCard
        title="Libro de Ingresos"
        description="Registro cronológico de todas las operaciones con base imponible e IVA desglosados"
        accent="#1d4ed8" accentBg="#eff6ff"
        icon={Receipt}
        keyFigure={String(revenue.length)}
        keyLabel={`operaci${revenue.length !== 1 ? "ones" : "ón"} · ${fEur(bruto)}`}
        empty={revenue.length === 0}
        emptyMsg="Sin transacciones en el período"
        onDownload={() => pdfLedger(revenue, period.label)}
        downloadLabel="Descargar Libro"
      >
        <div className={styles.tWrap}>
          <table className={styles.tbl}>
            <thead>
              <tr>
                <th>N.º</th><th>Fecha</th><th>Referencia</th><th>Cliente</th>
                <th className={styles.r}>Base Imp.</th><th className={styles.r}>IVA 21 %</th>
                <th className={styles.r}>Total</th><th>Método</th>
              </tr>
            </thead>
            <tbody>
              {[...revenue]
                .sort((a, b) => new Date(a.updatedAt ?? a.createdAt).getTime() - new Date(b.updatedAt ?? b.createdAt).getTime())
                .map((o, i) => {
                  const total = n(o.totalPrice);
                  return (
                    <tr key={o.id} className={styles.tRow}>
                      <td className={styles.seq}>{String(i + 1).padStart(3, "0")}</td>
                      <td className={styles.dateCell}>{fDate(o.updatedAt ?? o.createdAt)}</td>
                      <td><span className={styles.ref}>#{ o.id.substring(0, 8)}</span></td>
                      <td>{clientName(o)}</td>
                      <td className={`${styles.r} ${styles.mono}`}>{fEur(netoOf(total))}</td>
                      <td className={`${styles.r} ${styles.mono}`} style={{ color: "#6d28d9" }}>{fEur(ivaOf(total))}</td>
                      <td className={`${styles.r} ${styles.mono}`} style={{ fontWeight: 700 }}>{fEur(total)}</td>
                      <td><span className={styles.mTag}>{METHOD_LABELS[o.paymentMethod ?? ""] ?? "—"}</span></td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className={styles.tFoot}>
                <td colSpan={4}>TOTALES ({revenue.length} operaciones)</td>
                <td className={`${styles.r} ${styles.mono}`}>{fEur(netoTotal)}</td>
                <td className={`${styles.r} ${styles.mono}`} style={{ color: "#6d28d9" }}>{fEur(ivaTotal)}</td>
                <td className={`${styles.r} ${styles.mono}`}>{fEur(bruto)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportCard>

      {/* 3. Informe IVA */}
      <ReportCard
        title="Informe de IVA — Ref. Modelo 303"
        description="Cuotas IVA repercutidas por mes para la declaración trimestral obligatoria"
        accent="#6d28d9" accentBg="#f5f3ff"
        icon={FileText}
        keyFigure={fEur(ivaTotal)}
        keyLabel="cuota IVA devengada"
        empty={revenue.length === 0}
        emptyMsg="Sin operaciones sujetas a IVA en el período"
        onDownload={() => pdfVAT(revenue, period.label)}
        downloadLabel="Descargar IVA"
      >
        <div className={styles.vatBlock}>
          <div className={styles.vatTable}>
            <table className={styles.tbl}>
              <thead>
                <tr>
                  <th>Mes</th><th className={styles.r}>N.º Ops.</th>
                  <th className={styles.r}>Base Imponible</th>
                  <th className={styles.r}>Cuota IVA 21 %</th>
                  <th className={styles.r}>Total Facturado</th>
                </tr>
              </thead>
              <tbody>
                {monthBreakdown.map((row, i) => (
                  <tr key={i} className={styles.tRow}>
                    <td>{MONTHS[row.month]} {row.year}</td>
                    <td className={styles.r}>{row.count}</td>
                    <td className={`${styles.r} ${styles.mono}`}>{fEur(netoOf(row.bruto))}</td>
                    <td className={`${styles.r} ${styles.mono}`} style={{ color: "#6d28d9" }}>{fEur(ivaOf(row.bruto))}</td>
                    <td className={`${styles.r} ${styles.mono}`} style={{ fontWeight: 700 }}>{fEur(row.bruto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.tFoot}>
                  <td>TOTAL PERÍODO</td>
                  <td className={styles.r}>{revenue.length}</td>
                  <td className={`${styles.r} ${styles.mono}`}>{fEur(netoTotal)}</td>
                  <td className={`${styles.r} ${styles.mono}`} style={{ color: "#6d28d9" }}>{fEur(ivaTotal)}</td>
                  <td className={`${styles.r} ${styles.mono}`}>{fEur(bruto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className={styles.vatNote}>
            <CheckCircle2 size={13} color="#6d28d9" style={{ flexShrink: 0, marginTop: 1 }} />
            <p>
              Cifras de referencia para el <strong>Modelo 303</strong>: casilla 01 (base) <strong>{fEur(netoTotal)}</strong> ·
              casilla 03 (cuota) <strong>{fEur(ivaTotal)}</strong>.
              Contraste siempre con su contabilidad oficial antes de presentar.
            </p>
          </div>
        </div>
      </ReportCard>

      {/* 4. Aging de Cobros */}
      <ReportCard
        title="Aging de Cuentas por Cobrar"
        description="Análisis de antigüedad de saldos pendientes para identificar riesgos de impago"
        accent="#b45309" accentBg="#fffbeb"
        icon={Clock}
        keyFigure={fEur(pendTotal)}
        keyLabel={`${pending.length} orden${pending.length !== 1 ? "es" : ""} pendiente${pending.length !== 1 ? "s" : ""}`}
        empty={pending.length === 0}
        emptyMsg="Sin saldos pendientes"
        onDownload={() => pdfAging(pending)}
        downloadLabel="Descargar Aging"
      >
        <div className={styles.tWrap}>
          <table className={styles.tbl}>
            <thead>
              <tr>
                <th>Ref.</th><th>Cliente</th><th>Dispositivo</th>
                <th className={styles.r}>Total</th><th className={styles.r}>Cobrado</th>
                <th className={styles.r}>Saldo</th><th>Antigüedad</th><th></th>
              </tr>
            </thead>
            <tbody>
              {[...pending]
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map(o => {
                  const days = daysAgo(o.createdAt);
                  const agingStyle =
                    days >= 60 ? styles.agingDanger :
                    days >= 30 ? styles.agingRisk   :
                    days >= 15 ? styles.agingWarn   : "";
                  return (
                    <tr key={o.id} className={`${styles.tRow} ${agingStyle}`}>
                      <td><span className={styles.ref}>#{o.id.substring(0, 8)}</span></td>
                      <td>{clientName(o)}</td>
                      <td>{o.device ? [o.device.brand, o.device.model].filter(Boolean).join(" ") || o.device.type || "—" : "—"}</td>
                      <td className={`${styles.r} ${styles.mono}`}>{fEur(n(o.totalPrice))}</td>
                      <td className={`${styles.r} ${styles.mono}`}>{fEur(n(o.amountPaid))}</td>
                      <td className={`${styles.r} ${styles.mono}`} style={{ fontWeight: 700 }}>{fEur(n(o.balance))}</td>
                      <td>
                        <span className={`${styles.ageBadge} ${days >= 60 ? styles.ageD : days >= 30 ? styles.ageR : days >= 15 ? styles.ageW : ""}`}>
                          {days === 0 ? "Hoy" : `${days}d`}
                        </span>
                      </td>
                      <td><Link href={`/serviceOrders/${o.id}/edit`} className={styles.lBtn}>Ver</Link></td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className={styles.tFoot}>
                <td colSpan={5}>TOTAL PENDIENTE ({pending.length} órdenes)</td>
                <td className={`${styles.r} ${styles.mono}`}>{fEur(pendTotal)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportCard>

    </div>
  );
}
