import jsPDF from "jspdf";
import { ServiceOrder, ServiceStatus, Priority } from "../types";
import { PRIORITY_LABELS } from "../constants";
import { formatDate, formatCurrency } from "./format";

// ═══════════════════════════════════════════════════════════════════════════════
// Datos del emisor — actualizar con los datos reales de la empresa
// ═══════════════════════════════════════════════════════════════════════════════
const COMPANY_NAME    = "2InSide";
const COMPANY_NIF     = "B-XXXXXXXX";                  // ← Sustituir por el NIF/CIF real
const COMPANY_ADDRESS = "C/ Ejemplo, 00 · 28000 Madrid"; // ← Sustituir por la dirección real
const COMPANY_PHONE   = "(621) 034-700";
const COMPANY_EMAIL   = "soporte2insidemovil@gmail.com";
const COMPANY_WEB     = "www.2inside.com";

/**
 * Escapes text before it is placed inside the printable HTML. Client names,
 * observations, services... are typed by users; without this, a value such as
 * `<img src=x onerror=...>` would run as script in the app's origin.
 */
const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

export const printOrderPDF = (order: ServiceOrder): void => {
  // ── Helpers ─────────────────────────────────────────────────────────────────
  const n = (v: number | string | undefined | null): number => Number(v ?? 0);
  const fEur = (v: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
  const fDate = (d: string | Date) =>
    new Date(d).toLocaleDateString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

  const IVA = 0.21;
  const netoOf  = (bruto: number) => bruto / (1 + IVA);
  const ivaOf   = (bruto: number) => bruto - netoOf(bruto);

  // ── Numeración de factura ───────────────────────────────────────────────────
  const now   = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const shortId = order.id.substring(0, 8).toUpperCase();
  const invoiceNumber  = `FAC-${yyyymm}-${shortId}`;
  const fechaExpedicion = fDate(now);

  // ── Datos del cliente ───────────────────────────────────────────────────────
  const clientName = `${order.client.firstName} ${order.client.lastName ?? ""}`.trim();

  // ── Tabla de servicios ──────────────────────────────────────────────────────
  const totalBruto   = n(order.totalPrice);
  const amountPaid   = n(order.amountPaid);
  const balance      = n(order.balance);
  const baseImponible = netoOf(totalBruto);
  const cuotaIVA     = ivaOf(totalBruto);

  let servicesRows = "";
  const svcs = order.services ?? [];

  if (svcs.length > 0) {
    const hasIndividualPrices = svcs.some(s => n(s.price) > 0);

    if (hasIndividualPrices) {
      // Una fila por servicio con desglose individual de IVA
      servicesRows = svcs.map(s => {
        const bruto = n(s.price);
        const neto  = netoOf(bruto);
        const iva   = ivaOf(bruto);
        const name  = s.name ?? s.description ?? "Servicio";
        const descExtra = s.description && s.name && s.description !== s.name
          ? `<div class="svc-desc">${esc(s.description)}</div>`
          : "";
        if (bruto > 0) {
          return `<tr>
            <td><div class="svc-name">${esc(name)}</div>${descExtra}</td>
            <td class="r">${fEur(neto)}</td>
            <td class="r">${fEur(iva)}</td>
            <td class="r fw">${fEur(bruto)}</td>
          </tr>`;
        }
        return `<tr>
          <td><div class="svc-name">${esc(name)}</div>${descExtra}</td>
          <td class="r muted">—</td>
          <td class="r muted">—</td>
          <td class="r fw muted">Incluido</td>
        </tr>`;
      }).join("");
    } else {
      // Sin precios individuales: una sola fila con el total
      const names = svcs.map(s => s.name ?? s.description ?? "Servicio").join(", ");
      servicesRows = `<tr>
        <td>
          <div class="svc-name">Servicios de reparación</div>
          <div class="svc-desc">${esc(names)}</div>
        </td>
        <td class="r">${fEur(baseImponible)}</td>
        <td class="r">${fEur(cuotaIVA)}</td>
        <td class="r fw">${fEur(totalBruto)}</td>
      </tr>`;
    }
  } else {
    // Sin servicios registrados — usar el total de la orden
    const obs = order.observations ? `<div class="svc-desc">${esc(order.observations)}</div>` : "";
    servicesRows = `<tr>
      <td><div class="svc-name">Servicio de reparación</div>${obs}</td>
      <td class="r">${fEur(baseImponible)}</td>
      <td class="r">${fEur(cuotaIVA)}</td>
      <td class="r fw">${fEur(totalBruto)}</td>
    </tr>`;
  }

  // ── Estado de pago ──────────────────────────────────────────────────────────
  type PStatus = { label: string; cls: string };
  const payMap: Record<string, PStatus> = {
    paid:         { label: "Pagada",             cls: "badge-paid"    },
    paid_partial: { label: "Pago Parcial",        cls: "badge-partial" },
    pending:      { label: "Pendiente de Pago",   cls: "badge-pending" },
  };
  const psi = payMap[order.paymentStatus ?? "pending"] ?? payMap["pending"];

  const pmLabel: Record<string, string> = {
    cash:     "Efectivo",
    card:     "Tarjeta Bancaria",
    transfer: "Transferencia Bancaria",
    other:    "Otro medio",
  };

  // ── Dispositivo ─────────────────────────────────────────────────────────────
  const dev = order.device;

  // ── HTML ────────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${invoiceNumber} — ${COMPANY_NAME}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @page{size:A4 portrait;margin:0}
  body{
    font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    font-size:11px;color:#1e293b;background:#fff;
  }
  .page{
    width:210mm;min-height:297mm;
    padding:15mm 18mm 13mm;
    display:flex;flex-direction:column;
  }

  /* ── Header ── */
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;
    padding-bottom:14px;border-bottom:3px solid #0f172a;margin-bottom:18px}
  .co-name{font-size:28px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;margin-bottom:3px}
  .co-tag{font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:1.6px;margin-bottom:9px}
  .co-info{font-size:9.5px;color:#475569;line-height:1.75}
  .co-info span{display:block}
  .inv-block{text-align:right}
  .inv-badge{display:inline-block;background:#0f172a;color:#fff;font-size:9.5px;
    font-weight:700;letter-spacing:2.5px;padding:3px 11px;border-radius:3px;margin-bottom:7px}
  .inv-num{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;margin-bottom:7px}
  .inv-meta{font-size:9.5px;color:#64748b;line-height:1.85}
  .inv-meta strong{color:#1e293b;font-weight:600}

  /* ── Parties ── */
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
  .party{border:1px solid #e2e8f0;border-radius:7px;padding:11px 14px;background:#f8fafc}
  .party.cli{border-left:3px solid #2563eb;background:#eff6ff}
  .p-lbl{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;
    color:#64748b;margin-bottom:5px}
  .p-name{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px}
  .p-info{font-size:9.5px;color:#475569;line-height:1.7}
  .p-info span{display:block}

  /* ── Device bar ── */
  .dev-bar{background:#f1f5f9;border:1px solid #e2e8f0;border-left:3px solid #64748b;
    border-radius:7px;padding:10px 14px;margin-bottom:16px;
    display:flex;align-items:flex-start;gap:12px}
  .dev-ico{width:32px;height:32px;background:#0f172a;border-radius:6px;
    display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
  .dev-lbl{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;
    color:#64748b;margin-bottom:3px}
  .dev-model{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px}
  .chips{display:flex;gap:8px;flex-wrap:wrap}
  .chip{font-size:9px;color:#475569;background:#fff;border:1px solid #e2e8f0;
    border-radius:999px;padding:2px 8px}
  .chip strong{color:#1e293b}

  /* ── Services table ── */
  .sec-lbl{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;
    color:#64748b;margin-bottom:6px}
  table.svc{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px}
  table.svc thead tr{background:#0f172a}
  table.svc thead th{color:#fff;padding:7px 10px;text-align:left;font-size:8.5px;
    font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
  table.svc thead th.r{text-align:right}
  table.svc tbody tr:nth-child(even){background:#f8fafc}
  table.svc tbody td{padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  table.svc tbody td.r{text-align:right;font-variant-numeric:tabular-nums}
  table.svc tbody td.fw{font-weight:600}
  table.svc tbody td.muted{color:#94a3b8}
  .svc-name{font-weight:600;color:#0f172a}
  .svc-desc{font-size:8.5px;color:#64748b;margin-top:2px}

  /* ── Totals ── */
  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:14px}
  .totals{width:235px;border:1px solid #e2e8f0;border-radius:7px;overflow:hidden}
  .t-row{display:flex;justify-content:space-between;align-items:center;
    padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:10px;color:#475569}
  .t-row:last-child{border-bottom:none}
  .t-row.grand{background:#0f172a;padding:9px 12px}
  .t-row.grand .t-lbl{font-size:12px;font-weight:700;color:#fff}
  .t-row.grand .t-val{font-size:15px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
  .t-row.paid .t-val{color:#059669;font-weight:700}
  .t-row.bal .t-val{color:#d97706;font-weight:700}
  .t-val{font-variant-numeric:tabular-nums}

  /* ── Payment pills ── */
  .pay-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
  .pill{display:inline-flex;align-items:center;gap:4px;border:1px solid #e2e8f0;
    border-radius:999px;padding:4px 10px;font-size:9px;color:#475569;background:#f8fafc}
  .pill strong{color:#1e293b}
  .badge-paid{background:#dcfce7;border-color:#bbf7d0;color:#166534;font-weight:700}
  .badge-partial{background:#fef3c7;border-color:#fde68a;color:#92400e;font-weight:700}
  .badge-pending{background:#fee2e2;border-color:#fecaca;color:#991b1b;font-weight:700}

  /* ── Print button (solo pantalla) ── */
  .no-print{
    position:fixed;bottom:20px;right:20px;
    background:#0f172a;color:#fff;border:none;
    font-family:inherit;font-size:12px;font-weight:600;
    padding:10px 22px;border-radius:8px;cursor:pointer;
    box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:999
  }
  .no-print:hover{background:#1e3a5f}

  /* ── Footer ── */
  .footer{margin-top:auto;border-top:1px solid #e2e8f0;padding-top:10px}
  .ft-ref{display:flex;justify-content:space-between;font-size:7.5px;
    color:#94a3b8;margin-bottom:5px}
  .ft-legal{font-size:7.5px;color:#94a3b8;line-height:1.6;text-align:center}

  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .no-print{display:none!important}
  }
</style>
</head>
<body>
<div class="page">

  <!-- ── HEADER ── -->
  <div class="hdr">
    <div>
      <div class="co-name">${COMPANY_NAME}</div>
      <div class="co-tag">Servicio Técnico Especializado</div>
      <div class="co-info">
        <span>NIF: ${COMPANY_NIF}</span>
        <span>${COMPANY_ADDRESS}</span>
        <span>Tel: ${COMPANY_PHONE} &nbsp;·&nbsp; ${COMPANY_EMAIL}</span>
        <span>${COMPANY_WEB}</span>
      </div>
    </div>
    <div class="inv-block">
      <div class="inv-badge">FACTURA</div>
      <div class="inv-num">${invoiceNumber}</div>
      <div class="inv-meta">
        <strong>Fecha de expedición:</strong> ${fechaExpedicion}<br>
        <strong>Referencia de orden:</strong> #${shortId}
        ${order.assignedTo ? `<br><strong>Técnico asignado:</strong> ${esc(order.assignedTo)}` : ""}
      </div>
    </div>
  </div>

  <!-- ── PARTES ── -->
  <div class="parties">
    <div class="party">
      <div class="p-lbl">Emisor de la factura</div>
      <div class="p-name">${COMPANY_NAME}</div>
      <div class="p-info">
        <span>NIF: ${COMPANY_NIF}</span>
        <span>${COMPANY_ADDRESS}</span>
        <span>Tel: ${COMPANY_PHONE}</span>
        <span>${COMPANY_EMAIL}</span>
      </div>
    </div>
    <div class="party cli">
      <div class="p-lbl">Facturado a</div>
      <div class="p-name">${esc(clientName)}</div>
      <div class="p-info">
        ${order.client.dniType && order.client.dni
          ? `<span>${esc(order.client.dniType)}: ${esc(order.client.dni)}</span>`
          : ""}
        ${order.client.phoneNumber ? `<span>Tel: ${esc(order.client.phoneNumber)}</span>` : ""}
        ${order.client.email    ? `<span>${esc(order.client.email)}</span>`    : ""}
        ${order.client.address
          ? `<span>${esc(order.client.address)}${order.client.postalCode ? ", " + esc(order.client.postalCode) : ""}${order.client.city ? " " + esc(order.client.city) : ""}</span>`
          : ""}
      </div>
    </div>
  </div>

  <!-- ── DISPOSITIVO ── -->
  ${dev ? `
  <div class="dev-bar">
    <div class="dev-ico">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
        <path d="M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10
                 a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-5 18a1 1 0
                 1 1 0-2 1 1 0 0 1 0 2z"/>
      </svg>
    </div>
    <div style="flex:1">
      <div class="dev-lbl">Equipo reparado</div>
      <div class="dev-model">${esc(dev.brand)} ${esc(dev.model)}</div>
      <div class="chips">
        <span class="chip"><strong>Tipo:</strong> ${esc(dev.type)}</span>
        ${dev.imei           ? `<span class="chip"><strong>IMEI:</strong> ${esc(dev.imei)}</span>`                     : ""}
        ${dev.inventoryCode  ? `<span class="chip"><strong>Código inventario:</strong> ${esc(dev.inventoryCode)}</span>` : ""}
      </div>
    </div>
  </div>` : ""}

  <!-- ── TABLA DE SERVICIOS ── -->
  <div class="sec-lbl">Descripción de servicios prestados</div>
  <table class="svc">
    <thead>
      <tr>
        <th style="width:50%">Concepto / Servicio</th>
        <th class="r">Base Imponible</th>
        <th class="r">IVA (21&nbsp;%)</th>
        <th class="r">Total</th>
      </tr>
    </thead>
    <tbody>
      ${servicesRows}
    </tbody>
  </table>

  <!-- ── TOTALES ── -->
  <div class="totals-wrap">
    <div class="totals">
      <div class="t-row">
        <span class="t-lbl">Base imponible (sin IVA)</span>
        <span class="t-val">${fEur(baseImponible)}</span>
      </div>
      <div class="t-row">
        <span class="t-lbl">IVA (21&nbsp;%)</span>
        <span class="t-val">${fEur(cuotaIVA)}</span>
      </div>
      <div class="t-row grand">
        <span class="t-lbl">TOTAL</span>
        <span class="t-val">${fEur(totalBruto)}</span>
      </div>
      ${amountPaid > 0 ? `
      <div class="t-row paid">
        <span class="t-lbl">Importe abonado</span>
        <span class="t-val">${fEur(amountPaid)}</span>
      </div>` : ""}
      ${balance > 0 ? `
      <div class="t-row bal">
        <span class="t-lbl">Saldo pendiente</span>
        <span class="t-val">${fEur(balance)}</span>
      </div>` : ""}
    </div>
  </div>

  <!-- ── PAGO ── -->
  <div class="pay-row">
    <span class="pill ${psi.cls}">${psi.label}</span>
    ${order.paymentMethod
      ? `<span class="pill"><strong>Forma de pago:</strong>&nbsp;${esc(pmLabel[order.paymentMethod] ?? order.paymentMethod)}</span>`
      : ""}
    <span class="pill"><strong>Fecha de expedición:</strong>&nbsp;${fechaExpedicion}</span>
  </div>

  <!-- ── PIE DE PÁGINA ── -->
  <div class="footer">
    <div class="ft-ref">
      <span>Orden de servicio: #${shortId}</span>
      <span>Nº Factura: ${invoiceNumber}</span>
    </div>
    <div class="ft-legal">
      Documento emitido conforme al Real Decreto 1619/2012, de 30 de noviembre, por el que se aprueba el Reglamento de Facturación.<br>
      Esta factura acredita los servicios de reparación realizados y sirve como documento de garantía de los mismos.<br>
      ${COMPANY_NAME} &nbsp;·&nbsp; ${COMPANY_EMAIL} &nbsp;·&nbsp; Tel: ${COMPANY_PHONE}
    </div>
  </div>

</div>

<button class="no-print" onclick="window.print()">🖨️ Imprimir factura</button>

<script>window.addEventListener('load', function(){ window.print(); });</script>
</body>
</html>`;

  const pw = window.open("", "_blank");
  if (pw) {
    pw.document.write(html);
    pw.document.close();
  }
};

const calculateTicketHeight = (
  order: ServiceOrder,
  width: number,
  margin: number,
  contentWidth: number,
): number => {
  // header + contact + dividers + order-id block + client block
  let height = 12 + 14 + 42 + 12 + 14 + 14 + 14 + 44 + 58;

  const tempDoc = new jsPDF();
  const deviceModel = `${order.device.brand ?? ""} ${order.device.model}`.trim();
  const splitModel = tempDoc.splitTextToSize(deviceModel, contentWidth - 12);
  height += 28 + (splitModel.length - 1) * 12 + 14; // device box

  height += 46; // status/priority grid

  if (order.services && order.services.length > 0) {
    height += 14; // section header
    let servicesHeight = 14;
    order.services.forEach((service) => {
      const serviceName = service.name || service.description || "Sin especificar";
      const splitService = tempDoc.splitTextToSize(serviceName, contentWidth - 24);
      servicesHeight += splitService.length * 12;
    });
    height += servicesHeight + 12;
  }

  // Observations section
  if (order.observations) {
    height += 14; // section header
    const splitObs = tempDoc.splitTextToSize(order.observations, contentWidth - 12);
    height += splitObs.length * 11 + 22;
  }

  const hasPricing = order.totalPrice || order.amountPaid || order.balance;
  if (hasPricing) {
    height += 20 + 14; // dashed divider (espacio ampliado) + section header
    const hasPending = !!(order.balance && order.balance > 0);
    const hasAnticipo = !!(order.amountPaid && order.amountPaid > 0 && hasPending);
    let finH = 14;          // padding superior
    finH += 12;             // fila Total
    finH += 10;             // divider interno + gap
    if (hasAnticipo) finH += 16; // fila anticipo
    finH += 12;             // fila estado (cobrado / debe)
    if (order.paymentMethod) finH += 16; // divider + fila método
    finH += 10;             // padding inferior
    height += finH + 14;
  }

  // Footer: divider + thanks + web + padding (no barcode)
  height += 14 + 12 + 10 + 30;

  return Math.max(height, 500);
};

export const printOrderTicket = (order: ServiceOrder): jsPDF => {
  const width = 219.21;
  const margin = 15;
  const contentWidth = width - margin * 2;
  const centerX = width / 2;

  const calculatedHeight = calculateTicketHeight(order, width, margin, contentWidth);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [width, calculatedHeight],
  });

  let currentY = 12;

  const drawDivider = (
    y: number,
    style: "solid" | "dashed" | "double" = "solid",
    weight: number = 0.5,
  ) => {
    doc.setDrawColor(0);
    doc.setLineWidth(weight);
    if (style === "dashed") {
      doc.setLineDash([3, 2]);
      doc.line(margin, y, width - margin, y);
      doc.setLineDash([]);
    } else if (style === "double") {
      doc.line(margin, y, width - margin, y);
      doc.line(margin, y + 2, width - margin, y + 2);
    } else {
      doc.line(margin, y, width - margin, y);
    }
  };

  const drawBox = (
    x: number,
    y: number,
    w: number,
    h: number,
    fillColor: number[] = [248, 248, 248],
  ) => {
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, w, h, 2, 2, "FD");
  };

  const drawSectionHeader = (text: string, y: number): number => {
    doc.setFillColor(0);
    doc.rect(margin, y, 2, 9, "F");
    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin + 6, y + 7);
    return y + 14;
  };

  // ── Top accent bar ──────────────────────────────────────────────────────────
  doc.setFillColor(0);
  doc.rect(0, 0, width, 3, "F");

  currentY = 14;

  // ── Company header ──────────────────────────────────────────────────────────
  doc.setFillColor(0);
  doc.roundedRect(margin, currentY, contentWidth, 34, 3, 3, "F");

  doc.setTextColor(255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("2InSide", centerX, currentY + 14, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("SERVICIO TECNICO ESPECIALIZADO", centerX, currentY + 26, { align: "center" });

  currentY += 42;

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Tel: 642 372 481", centerX, currentY, { align: "center" });
  currentY += 12;
  doc.setFontSize(8);
  doc.text("2sinside@gmail.com", centerX, currentY, { align: "center" });

  currentY += 14;
  drawDivider(currentY, "double", 0.8);
  currentY += 14;

  // ── Order ID block ──────────────────────────────────────────────────────────
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(margin, currentY, contentWidth, 36, 3, 3, "F");

  doc.setFillColor(0, 0, 0);
  doc.rect(margin, currentY, 3, 36, "F");

  doc.setTextColor(0);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ORDEN DE SERVICIO", margin + 10, currentY + 12);

  doc.setTextColor(0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`#${order.id.substring(0, 8).toUpperCase()}`, margin + 10, currentY + 28);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  doc.text(formatDate(order.createdAt), width - margin - 4, currentY + 28, { align: "right" });

  currentY += 44;

  // ── CLIENTE ─────────────────────────────────────────────────────────────────
  currentY = drawSectionHeader("CLIENTE", currentY);

  drawBox(margin, currentY, contentWidth, 46, [248, 248, 248]);

  const clientName = `${order.client.firstName} ${order.client.lastName || ""}`.trim();
  const displayClientName = clientName.length > 30 ? clientName.substring(0, 30) + "..." : clientName;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(displayClientName, margin + 6, currentY + 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);

  let clientY = currentY + 24;
  doc.text(`Tel: ${order.client.phoneNumber}`, margin + 6, clientY);

  if (order.client.email) {
    clientY += 12;
    const emailText = order.client.email.length > 28 ? order.client.email.substring(0, 28) + "…" : order.client.email;
    doc.text(emailText, margin + 6, clientY);
  }

  if (order.client.city) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const cityText = order.client.city;
    const textWidth = doc.getTextWidth(cityText);
    const padding = 8;
    const boxWidth = textWidth + padding;
    const boxHeight = 11;
    const boxX = width - margin - boxWidth - 4;

    doc.setFillColor(0);
    doc.roundedRect(boxX, currentY + 4, boxWidth, boxHeight, 2, 2, "F");
    doc.setTextColor(255);
    doc.text(cityText, boxX + boxWidth / 2, currentY + 12, { align: "center" });
  }

  currentY += 58;

  // ── EQUIPO ──────────────────────────────────────────────────────────────────
  currentY = drawSectionHeader("EQUIPO", currentY);

  const deviceModel = `${order.device.brand ?? ""} ${order.device.model}`.trim();
  const splitModel = doc.splitTextToSize(deviceModel, contentWidth - 12);
  const deviceBoxHeight = 28 + (splitModel.length - 1) * 12;

  drawBox(margin, currentY, contentWidth, deviceBoxHeight);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(splitModel, margin + 6, currentY + 12, { maxWidth: contentWidth - 12 });

  const deviceY = currentY + 12 + splitModel.length * 12;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);

  const deviceDetails: string[] = [];
  if (order.device.imei) deviceDetails.push(`IMEI: ${order.device.imei}`);
  // The unlock code/pattern is never printed: tickets and invoices leave the shop.

  if (deviceDetails.length > 0) {
    const detailsText = deviceDetails.join("  |  ");
    const splitDetails = doc.splitTextToSize(detailsText, contentWidth - 12);
    doc.text(splitDetails, margin + 6, deviceY, { maxWidth: contentWidth - 12 });
  }

  currentY += deviceBoxHeight + 12;

  // ── Estado / Prioridad grid ──────────────────────────────────────────────────
  const gridY = currentY;
  const colWidth = (contentWidth - 4) / 2;

  drawBox(margin, gridY, colWidth, 36);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("ESTADO", margin + 5, gridY + 10);

  const statusTicketLabels: Record<string, string> = {
    [ServiceStatus.PENDIENTE_CLIENTE]: "Pendiente Cliente",
    [ServiceStatus.EN_PROGRESO]: "En Progreso",
    [ServiceStatus.PENDIENTE_PIEZAS]: "Pend. Piezas",
    [ServiceStatus.FINALIZADO]: "Finalizado",
    [ServiceStatus.ENTREGADO]: "Entregado",
    [ServiceStatus.CANCELADO]: "Cancelado",
  };

  const estadoText = statusTicketLabels[order.status] ?? order.status;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(estadoText, margin + 5, gridY + 24);

  drawBox(margin + colWidth + 4, gridY, colWidth, 36);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("PRIORIDAD", margin + colWidth + 8, gridY + 10);

  const priorityStyleMap: Record<string, { fill: number[] }> = {
    [Priority.LOW]: { fill: [200, 200, 200] },
    [Priority.MEDIUM]: { fill: [150, 150, 150] },
    [Priority.HIGH]: { fill: [100, 100, 100] },
    [Priority.URGENT]: { fill: [0, 0, 0] },
  };

  const priorityInfo = {
    text: PRIORITY_LABELS[order.priority] ?? order.priority,
    fill: priorityStyleMap[order.priority]?.fill ?? [150, 150, 150],
  };

  doc.setFillColor(priorityInfo.fill[0], priorityInfo.fill[1], priorityInfo.fill[2]);
  doc.circle(margin + colWidth + 10, gridY + 20, 3, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", order.priority === Priority.URGENT ? "bold" : "normal");
  doc.setTextColor(0);
  doc.text(priorityInfo.text, margin + colWidth + 17, gridY + 24);

  currentY = gridY + 46;

  // ── SERVICIOS ───────────────────────────────────────────────────────────────
  if (order.services && order.services.length > 0) {
    currentY = drawSectionHeader("SERVICIOS", currentY);

    let servicesHeight = 14;
    order.services.forEach((service) => {
      const serviceName = service.name || service.description || "Sin especificar";
      const splitService = doc.splitTextToSize(serviceName, contentWidth - 24);
      servicesHeight += splitService.length * 12;
    });

    drawBox(margin, currentY, contentWidth, servicesHeight);

    let serviceY = currentY + 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);

    order.services.forEach((service) => {
      const serviceName = service.name || service.description || "Sin especificar";
      doc.setFillColor(0);
      doc.circle(margin + 8, serviceY - 2.5, 1.5, "F");
      const splitService = doc.splitTextToSize(serviceName, contentWidth - 24);
      doc.text(splitService, margin + 14, serviceY);
      serviceY += splitService.length * 12;
    });

    currentY += servicesHeight + 12;
  }

  // ── OBSERVACIONES ───────────────────────────────────────────────────────────
  if (order.observations && order.observations.trim()) {
    currentY = drawSectionHeader("OBSERVACIONES", currentY);

    const splitObs = doc.splitTextToSize(order.observations.trim(), contentWidth - 12);
    const obsBoxH = splitObs.length * 11 + 16;
    drawBox(margin, currentY, contentWidth, obsBoxH, [252, 252, 252]);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(40, 40, 40);
    doc.text(splitObs, margin + 6, currentY + 10, { maxWidth: contentWidth - 12 });

    currentY += obsBoxH + 12;
  }

  // ── PRESUPUESTO ─────────────────────────────────────────────────────────────
  const hasPricing = order.totalPrice || order.amountPaid || order.balance;

  if (hasPricing) {
    // Separador con más respiro antes de la sección
    drawDivider(currentY, "dashed", 0.5);
    currentY += 20;

    currentY = drawSectionHeader("PRESUPUESTO", currentY);

    const hasPending = !!(order.balance && order.balance > 0);
    const hasAnticipo = !!(order.amountPaid && order.amountPaid > 0 && hasPending);
    const isCobrado   = !hasPending && !!(order.amountPaid && order.amountPaid > 0);

    // Cálculo de altura del box
    let finBoxH = 14;          // padding superior
    finBoxH += 12;             // fila Total
    finBoxH += 10;             // divider + gap
    if (hasAnticipo) finBoxH += 16;
    finBoxH += 12;             // fila estado
    if (order.paymentMethod) finBoxH += 16; // divider + fila método
    finBoxH += 10;             // padding inferior

    drawBox(margin, currentY, contentWidth, finBoxH);

    let finY = currentY + 14; // ← padding superior dentro del box

    // ── Fila Total ───────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("Total:", margin + 6, finY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(formatCurrency(order.totalPrice ?? 0), width - margin - 6, finY, { align: "right" });
    finY += 12; // baseline → top of divider

    // Divider fino entre Total y estado
    drawDivider(finY, "solid", 0.35);
    finY += 10; // gap debajo del divider

    // ── Fila anticipo (solo si hay pago parcial) ─────────────────
    if (hasAnticipo) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.text("Anticipo recibido:", margin + 6, finY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(formatCurrency(order.amountPaid ?? 0), width - margin - 6, finY, { align: "right" });
      finY += 16;
    }

    // ── Fila estado: Cobrado / Debe ──────────────────────────────
    if (isCobrado) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text("Cobrado", margin + 6, finY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(formatCurrency(order.amountPaid ?? 0), width - margin - 6, finY, { align: "right" });
    } else if (hasPending) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.text("Saldo pendiente:", margin + 6, finY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(formatCurrency(order.balance ?? 0), width - margin - 6, finY, { align: "right" });
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.text("Pendiente de cobro", margin + 6, finY);
    }
    finY += 12;

    // ── Forma de pago ────────────────────────────────────────────
    if (order.paymentMethod) {
      const paymentMethodTicketMap: Record<string, string> = {
        cash:     "Efectivo",
        card:     "Tarjeta bancaria",
        transfer: "Transferencia",
        other:    "Otro",
      };
      const methodLabel = paymentMethodTicketMap[order.paymentMethod] ?? order.paymentMethod;

      drawDivider(finY, "solid", 0.35);
      finY += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`Forma de pago: ${methodLabel}`, margin + 6, finY);
    }

    currentY += finBoxH + 14;
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  drawDivider(currentY, "double", 0.8);
  currentY += 14;

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Gracias por confiar en 2InSide", centerX, currentY, { align: "center" });
  currentY += 12;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("www.2inside.com", centerX, currentY, { align: "center" });

  doc.autoPrint();
  const pdfBlob = doc.output("blob");
  const blobUrl = URL.createObjectURL(pdfBlob);

  const printWindow = window.open(blobUrl, "_blank");
  if (printWindow) {
    printWindow.onload = function () {
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    };
  }

  return doc;
};
