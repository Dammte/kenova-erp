"use client";

import { apiFetch } from "@/lib/api";

import { useState, useRef, useCallback, DragEvent } from "react";
import {
  X,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  FileSearch,
  PackagePlus,
  RefreshCcw,
  GitMerge,
  FilePlus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedItem {
  name: string;
  quantity: number;
  unitPrice: number;
  sku: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
}

type MatchType = "new" | "sku_match" | "name_exact" | "name_similar";
type MergeDecision = "merge" | "create_new";

interface MatchedItem {
  id: string;
  name: string;
  sku: string;
  stock: number;
}

interface ImportRow {
  _key: string;
  include: boolean;
  name: string;
  sku: string;
  brand: string;
  category: string;
  quantity: number;
  costPrice: number;
  // Match resolution
  matchType: MatchType;
  matchedItem: MatchedItem | null;
  mergeDecision: MergeDecision;
}

interface ImportResult {
  created: number;
  updated: number;
  merged: number;
  errors: number;
}

type Step = "upload" | "analyzing" | "preview" | "importing" | "done";

interface ExistingItem {
  sku: string;
  id: string;
  name: string;
  stock: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  existingItems: ExistingItem[];
  apiUrl: string;
}

// ── Similarity helpers ────────────────────────────────────────────────────────

/** Removes accents, lowercases, strips non-alphanumeric chars */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Word-overlap score between two strings (0–1).
 * Only considers words longer than 2 characters to avoid noise words.
 */
function wordOverlap(a: string, b: string): number {
  const wa = new Set(normalize(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normalize(b).split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  wa.forEach((w) => { if (wb.has(w)) common++; });
  return common / Math.max(wa.size, wb.size);
}

/**
 * Classify how a parsed invoice item matches against existing inventory.
 * Priority: exact SKU (case-insensitive) → exact name → similar name
 */
function detectMatch(
  item: ParsedItem,
  autSku: string,
  existing: ExistingItem[]
): { matchType: MatchType; matchedItem: MatchedItem | null; mergeDecision: MergeDecision } {
  const skuToCheck = (item.sku ?? autSku).toLowerCase();

  // 1. Case-insensitive SKU match
  const skuMatch = existing.find((e) => e.sku.toLowerCase() === skuToCheck);
  if (skuMatch) {
    return { matchType: "sku_match", matchedItem: skuMatch, mergeDecision: "merge" };
  }

  // 2. Exact name match after normalization
  const normName = normalize(item.name);
  const nameExact = existing.find((e) => normalize(e.name) === normName);
  if (nameExact) {
    return { matchType: "name_exact", matchedItem: nameExact, mergeDecision: "merge" };
  }

  // 3. High word-overlap (≥ 0.65) — possible duplicate, user decides
  let best: ExistingItem | null = null;
  let bestScore = 0;
  for (const e of existing) {
    const score = wordOverlap(item.name, e.name);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  if (bestScore >= 0.65 && best) {
    return { matchType: "name_similar", matchedItem: best, mergeDecision: "create_new" };
  }

  return { matchType: "new", matchedItem: null, mergeDecision: "create_new" };
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

let _keySeq = 0;
const genKey = () => `r_${++_keySeq}`;

const autoSku = (name: string, index: number): string => {
  const prefix =
    name.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 4) || "IMP";
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `${prefix}-${date}-${String(index + 1).padStart(2, "0")}`;
};

// ── Match badge config ────────────────────────────────────────────────────────

const MATCH_BADGE: Record<MatchType, { label: string; cls: string }> = {
  new:          { label: "Nuevo",      cls: "bg-green-100 text-green-700" },
  sku_match:    { label: "+ Stock",    cls: "bg-blue-100 text-blue-700" },
  name_exact:   { label: "⚠ Idéntico", cls: "bg-orange-100 text-orange-700" },
  name_similar: { label: "~ Similar",  cls: "bg-yellow-100 text-yellow-700" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportModal({
  isOpen,
  onClose,
  onImportComplete,
  existingItems,
  apiUrl,
}: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ────────────────────────────────────────────────────────────

  const acceptFile = useCallback((f: File) => {
    if (f.type !== "application/pdf") { setFileError("Solo se aceptan archivos PDF."); return; }
    if (f.size > 10 * 1024 * 1024) { setFileError("El archivo no puede superar 10 MB."); return; }
    setFileError(null);
    setFile(f);
  }, []);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  };

  // ── Analyze ──────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!file) return;
    setStep("analyzing");
    setAnalysisError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch(`${apiUrl}/inventory/import/analyze`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message ?? `Error del servidor (${res.status})`);
      }
      const parsed: ParsedItem[] = await res.json();
      if (parsed.length === 0) {
        setAnalysisError(
          "No se encontraron productos en el documento. " +
            "Asegúrate de que sea una factura o albarán de repuestos."
        );
        setStep("upload");
        return;
      }

      setRows(
        parsed.map((item, i) => {
          const sku = item.sku ?? autoSku(item.name, i);
          const { matchType, matchedItem, mergeDecision } = detectMatch(item, sku, existingItems);
          return {
            _key: genKey(),
            include: true,
            name: item.name,
            sku,
            brand: item.brand ?? "",
            category: item.category ?? "",
            quantity: item.quantity,
            costPrice: item.unitPrice,
            matchType,
            matchedItem,
            mergeDecision,
          };
        })
      );
      setStep("preview");
    } catch (err: any) {
      setAnalysisError(err?.message ?? "Error al analizar el documento.");
      setStep("upload");
    }
  };

  // ── Import ───────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    const selected = rows.filter((r) => r.include);
    if (selected.length === 0) return;
    setStep("importing");
    try {
      const payload = selected.map((r) => {
        const willMerge =
          r.mergeDecision === "merge" && r.matchedItem !== null;
        return {
          sku: r.sku,
          name: r.name,
          description: "",
          brand: r.brand,
          category: r.category,
          stock: r.quantity,
          costPrice: String(r.costPrice),
          // Only set mergeWithId when user chose to merge into an existing item
          mergeWithId: willMerge ? r.matchedItem!.id : undefined,
        };
      });

      const res = await apiFetch(`${apiUrl}/inventory/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Error del servidor (${res.status})`);
      const results: { action: string }[] = await res.json();
      setResult({
        created: results.filter((r) => r.action === "created").length,
        updated: results.filter((r) => r.action === "updated").length,
        merged:  results.filter((r) => r.action === "merged").length,
        errors:  results.filter((r) => r.action === "error").length,
      });
      setStep("done");
      onImportComplete();
    } catch (err: any) {
      setAnalysisError(err?.message ?? "Error al importar.");
      setStep("preview");
    }
  };

  // ── Row helpers ──────────────────────────────────────────────────────────────

  const updateRow = (key: string, field: keyof ImportRow, value: unknown) => {
    setRows((prev) =>
      prev.map((row) => (row._key === key ? { ...row, [field]: value } : row))
    );
  };

  const handleClose = () => {
    setStep("upload");
    setFile(null);
    setFileError(null);
    setAnalysisError(null);
    setRows([]);
    setResult(null);
    onClose();
  };

  // ── Derived counts ───────────────────────────────────────────────────────────

  const selectedRows  = rows.filter((r) => r.include);
  const selectedCount = selectedRows.length;
  const conflictCount = selectedRows.filter(
    (r) => r.matchType === "name_exact" || r.matchType === "name_similar"
  ).length;
  const unresolvedCount = selectedRows.filter(
    (r) =>
      (r.matchType === "name_exact" || r.matchType === "name_similar") &&
      r.mergeDecision === "create_new" &&
      r.matchType === "name_exact"   // exact-name conflicts should be explicitly resolved
  ).length;

  if (!isOpen) return null;

  const subtitles: Record<Step, string> = {
    upload:    "Sube un PDF de factura o albarán de compra",
    analyzing: "Analizando documento con inteligencia artificial…",
    preview:   `${rows.length} ítem${rows.length !== 1 ? "s" : ""} encontrado${rows.length !== 1 ? "s" : ""} — Revisa y confirma`,
    importing: "Importando ítems al inventario…",
    done:      "Importación completada",
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <PackagePlus size={18} className="text-slate-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800 text-base leading-tight">
                Importar desde Factura
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">{subtitles[step]}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-auto p-6 min-h-0">

          {/* ── UPLOAD ── */}
          {step === "upload" && (
            <div className="flex flex-col items-center gap-5 max-w-lg mx-auto py-2">
              {(fileError || analysisError) && (
                <div className="w-full flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{fileError ?? analysisError}</span>
                </div>
              )}

              <div
                className={`w-full rounded-2xl border-2 border-dashed cursor-pointer transition-all
                  ${dragOver ? "border-slate-500 bg-slate-50 scale-[1.01]" : "border-gray-300 hover:border-slate-400 hover:bg-gray-50"}
                  ${file ? "border-green-400 bg-green-50" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) acceptFile(f);
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
                  {file ? (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
                        <FileText size={26} className="text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{file.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {(file.size / 1024).toFixed(0)} KB · PDF · Haz clic para cambiar
                        </p>
                      </div>
                      <p className="text-xs font-semibold text-green-600">✓ Listo para analizar</p>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                        <Upload size={26} className="text-gray-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-700">Arrastra tu factura aquí</p>
                        <p className="text-xs text-gray-400 mt-1">o haz clic para seleccionar</p>
                      </div>
                      <p className="text-xs text-gray-400">Formato PDF · máximo 10 MB</p>
                    </>
                  )}
                </div>
              </div>

              <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">Documentos compatibles</p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                  <li>Facturas de proveedores de repuestos</li>
                  <li>Albaranes y notas de entrega</li>
                  <li>Pedidos de compra con precios</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── ANALYZING ── */}
          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center gap-6 py-20">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <FileText size={36} className="text-slate-400" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center">
                  <Loader2 size={18} className="text-slate-600 animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-800 text-lg">Analizando con IA</p>
                <p className="text-sm text-gray-500 mt-1">Identificando repuestos, cantidades y precios…</p>
              </div>
            </div>
          )}

          {/* ── IMPORTING ── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <Loader2 size={40} className="text-slate-600 animate-spin" />
              <p className="font-bold text-gray-800">Importando al inventario…</p>
              <p className="text-sm text-gray-500">No cierres esta ventana</p>
            </div>
          )}

          {/* ── DONE ── */}
          {step === "done" && result && (
            <div className="flex flex-col items-center gap-6 py-12">
              <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-800 text-xl">¡Importación completada!</p>
                <p className="text-sm text-gray-500 mt-1">El inventario ha sido actualizado</p>
              </div>
              <div className="flex gap-3 flex-wrap justify-center">
                {result.created > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl px-7 py-4 text-center">
                    <p className="text-3xl font-bold text-green-700">{result.created}</p>
                    <p className="text-xs text-green-600 font-semibold mt-1">Nuevos</p>
                  </div>
                )}
                {result.updated > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl px-7 py-4 text-center">
                    <p className="text-3xl font-bold text-blue-700">{result.updated}</p>
                    <p className="text-xs text-blue-600 font-semibold mt-1">Stock actualizado</p>
                  </div>
                )}
                {result.merged > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-2xl px-7 py-4 text-center">
                    <p className="text-3xl font-bold text-purple-700">{result.merged}</p>
                    <p className="text-xs text-purple-600 font-semibold mt-1">Fusionados</p>
                  </div>
                )}
                {result.errors > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl px-7 py-4 text-center">
                    <p className="text-3xl font-bold text-red-700">{result.errors}</p>
                    <p className="text-xs text-red-600 font-semibold mt-1">Con errores</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PREVIEW ── */}
          {step === "preview" && (
            <div className="flex flex-col gap-4">

              {analysisError && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  {analysisError}
                </div>
              )}

              {/* Conflict legend */}
              {conflictCount > 0 && (
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
                  <div>
                    <span className="font-semibold">{conflictCount} ítem{conflictCount > 1 ? "s" : ""} con coincidencia en inventario.</span>
                    {" "}Revisa cada uno y decide si fusionar el stock con el existente o crear un nuevo repuesto.
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="px-3 py-3 w-9">
                          <input
                            type="checkbox"
                            checked={rows.length > 0 && rows.every((r) => r.include)}
                            onChange={(e) =>
                              setRows((prev) => prev.map((r) => ({ ...r, include: e.target.checked })))
                            }
                            className="rounded"
                          />
                        </th>
                        <th className="px-3 py-3 text-left min-w-[180px]">Nombre del repuesto</th>
                        <th className="px-3 py-3 text-left w-32">SKU</th>
                        <th className="px-3 py-3 text-left w-32">Categoría</th>
                        <th className="px-3 py-3 text-right w-20">Cant.</th>
                        <th className="px-3 py-3 text-right w-28">P. Costo</th>
                        <th className="px-3 py-3 text-center w-28">Estado</th>
                        <th className="px-3 py-3 w-9" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const showConflict =
                          row.include &&
                          (row.matchType === "name_exact" || row.matchType === "name_similar");
                        const badge = MATCH_BADGE[row.matchType];

                        return (
                          <>
                            {/* ── Main row ── */}
                            <tr
                              key={row._key}
                              className={`border-t border-gray-100 transition-opacity ${
                                row.include ? "bg-white" : "bg-gray-50 opacity-40"
                              } ${showConflict ? "bg-amber-50/40" : ""}`}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={row.include}
                                  onChange={(e) => updateRow(row._key, "include", e.target.checked)}
                                  className="rounded"
                                />
                              </td>

                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={row.name}
                                  onChange={(e) => updateRow(row._key, "name", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                              </td>

                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={row.sku}
                                  onChange={(e) => updateRow(row._key, "sku", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                              </td>

                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={row.category}
                                  onChange={(e) => updateRow(row._key, "category", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                              </td>

                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={row.quantity}
                                  min="1"
                                  onChange={(e) =>
                                    updateRow(row._key, "quantity", Math.max(1, parseInt(e.target.value) || 1))
                                  }
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                              </td>

                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-400 text-xs shrink-0">€</span>
                                  <input
                                    type="number"
                                    value={row.costPrice}
                                    min="0"
                                    step="0.01"
                                    onChange={(e) =>
                                      updateRow(row._key, "costPrice", parseFloat(e.target.value) || 0)
                                    }
                                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-slate-400"
                                  />
                                </div>
                              </td>

                              <td className="px-3 py-2 text-center">
                                <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              </td>

                              <td className="px-3 py-2">
                                <button
                                  onClick={() => setRows((prev) => prev.filter((r) => r._key !== row._key))}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Quitar de la lista"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>

                            {/* ── Conflict resolution sub-row ── */}
                            {showConflict && (
                              <tr
                                key={`${row._key}_conflict`}
                                className="bg-amber-50 border-t border-amber-200"
                              >
                                <td />
                                <td colSpan={7} className="px-3 pb-3 pt-1">
                                  <div className="flex items-start gap-3 flex-wrap">
                                    <div className="flex items-center gap-1.5 text-xs text-amber-800">
                                      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                                      <span>
                                        {row.matchType === "name_exact"
                                          ? "Nombre idéntico en inventario:"
                                          : "Nombre similar encontrado:"}
                                        {" "}
                                        <strong>{row.matchedItem!.name}</strong>
                                        {" · "}SKU: <span className="font-mono">{row.matchedItem!.sku}</span>
                                        {" · "}Stock actual: <strong>{row.matchedItem!.stock}</strong>
                                      </span>
                                    </div>
                                    <div className="flex gap-2 ml-auto">
                                      <button
                                        onClick={() => updateRow(row._key, "mergeDecision", "merge")}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                                          row.mergeDecision === "merge"
                                            ? "bg-purple-600 text-white border-purple-600"
                                            : "bg-white text-gray-600 border-gray-300 hover:border-purple-400 hover:text-purple-600"
                                        }`}
                                      >
                                        <GitMerge size={12} />
                                        Añadir stock al existente (+{row.quantity})
                                      </button>
                                      <button
                                        onClick={() => updateRow(row._key, "mergeDecision", "create_new")}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                                          row.mergeDecision === "create_new"
                                            ? "bg-slate-700 text-white border-slate-700"
                                            : "bg-white text-gray-600 border-gray-300 hover:border-slate-400 hover:text-slate-600"
                                        }`}
                                      >
                                        <FilePlus size={12} />
                                        Crear como nuevo repuesto
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary */}
              <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                <span>
                  <span className="font-bold text-gray-700">{selectedCount}</span>{" "}
                  ítem{selectedCount !== 1 ? "s" : ""} seleccionado{selectedCount !== 1 ? "s" : ""}
                </span>
                {selectedRows.filter((r) => r.matchType === "new" && r.mergeDecision === "create_new").length > 0 && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                    {selectedRows.filter((r) => r.matchType === "new").length} nuevos
                  </span>
                )}
                {selectedRows.filter((r) => r.matchType === "sku_match").length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                    {selectedRows.filter((r) => r.matchType === "sku_match").length} aumentan stock (SKU)
                  </span>
                )}
                {selectedRows.filter((r) => (r.matchType === "name_exact" || r.matchType === "name_similar") && r.mergeDecision === "merge").length > 0 && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                    {selectedRows.filter((r) => (r.matchType === "name_exact" || r.matchType === "name_similar") && r.mergeDecision === "merge").length} se fusionarán
                  </span>
                )}
                {unresolvedCount > 0 && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                    ⚠ {unresolvedCount} conflicto{unresolvedCount > 1 ? "s" : ""} sin resolver
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-4 flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            {step === "done" ? "Cerrar" : "Cancelar"}
          </button>

          <div className="flex items-center gap-3">
            {step === "upload" && file && (
              <button
                onClick={handleAnalyze}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-800 transition-colors font-semibold text-sm shadow-sm"
              >
                <FileSearch size={16} />
                Analizar con IA
              </button>
            )}

            {step === "preview" && (
              <button
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-sm shadow-sm"
              >
                <CheckCircle2 size={16} />
                Importar {selectedCount} ítem{selectedCount !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
