"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { PartCard } from "./PartCard";
import { PartForm } from "./PartForm";
import { InvoiceImport } from "./InvoiceImport";
import { ReceiveSupplierOrder } from "./ReceiveSupplierOrder";
import { PartOrders } from "./PartOrders";
import { StockBadge } from "./StockBadge";
import { margin, partsFileName, partsSheet, summaryLine, type PartExport, type PartPage } from "./inventory";
import styles from "./Inventory.module.css";

/**
 * Design 3.4 «Repuestos»: what parts there are, where, and what to order.
 * Filters, page and the open part live in the address. Partners only (D5).
 */
export function InventoryPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>
            <strong>Sin permiso.</strong> El inventario lo gestiona el administrador.
          </p>
          <Link href="/panel" className={styles.link}>
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }
  return <Inventory />;
}

type View = "repuestos" | "importar" | "pedidos";
// Design R3 3.7: «Importar factura» is «Recibir» (an order, an invoice or by hand).
const VIEWS: [View, string][] = [
  ["repuestos", "Repuestos"],
  ["importar", "Recibir"],
  ["pedidos", "Pedidos de piezas"],
];

function Inventory() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const asked = params.get("vista");
  // «Revisar y recibir» from Proveedores › Pedidos.
  const supplierOrder = params.get("pedidoProveedor");
  const view: View = VIEWS.some(([v]) => v === asked) ? (asked as View) : "repuestos";
  if (view === "repuestos") return <PartsList />;
  return (
    <div className={styles.page}>
      <section className={styles.listPane} aria-label={view === "pedidos" ? "Pedidos de piezas" : "Recibir"}>
        <Header view={view} />
        {view === "pedidos" ? (
          <PartOrders />
        ) : supplierOrder ? (
          <ReceiveSupplierOrder orderId={supplierOrder} onDone={() => router.replace(pathname, { scroll: false })} />
        ) : (
          <InvoiceImport onDone={() => router.replace(pathname, { scroll: false })} />
        )}
      </section>
    </div>
  );
}

/** Title, actions and the tabs; switching starts clean. */
function Header({ view, onNew, summary }: { view: View; onNew?: () => void; summary?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const startNew = onNew ?? (() => router.replace(`${pathname}?repuesto=nuevo`, { scroll: false }));
  return (
    <>
      <header className={styles.top}>
        <div>
          <h1 className={styles.title}>Inventario</h1>
          {summary && <p className={styles.muted}>{summary}</p>}
        </div>
        <div className={styles.headActions}>
          <ExportButton />
          <Button variant="primary" size="sm" onClick={startNew}>
            + Nuevo repuesto
          </Button>
        </div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Vista">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={styles.tab}
            onClick={() => router.replace(v === "repuestos" ? pathname : `${pathname}?vista=${v}`, { scroll: false })}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

/** «Exportar Excel»: every part, as the old /inventory did. */
function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  const exportXlsx = async () => {
    setBusy(true);
    setProblem(false);
    try {
      const res = await apiFetch(`${API_URL}/inventory`);
      if (!res.ok) throw new Error(String(res.status));
      const parts = (await res.json()) as PartExport[];
      // Loaded on demand: the library is large and only this button needs it.
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(partsSheet(parts));
      ws["!cols"] = [16, 36, 14, 12, 22, 8, 8, 10, 10, 10, 16].map((wch) => ({ wch }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, ws, "Inventario");
      XLSX.writeFile(book, partsFileName(new Date()));
    } catch {
      setProblem(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" size="sm" loading={busy} loadingText="Preparando…" onClick={exportXlsx}>
        Exportar Excel
      </Button>
      {problem && (
        <span role="alert" className={styles.error}>
          No se ha podido crear el Excel. Reintenta.
        </span>
      )}
    </>
  );
}

function PartsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("categoria");
  const low = params.get("bajo") === "1";
  // «Agotados» and «Stock bajo» are two quick views: one at a time.
  const out = !low && params.get("agotados") === "1";
  const brand = params.get("marca");
  const provider = params.get("proveedor");
  const page = Math.max(1, Number(params.get("pagina")) || 1);
  const openId = params.get("repuesto");
  const creating = openId === "nuevo";
  const editing = !creating && Boolean(openId) && params.get("editar") === "1";

  const [draft, setDraft] = useState(q);
  const [data, setData] = useState<PartPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const go = (next: Record<string, string | null>) => {
    const all = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) all.set(k, v);
      else all.delete(k);
    }
    if (!("pagina" in next) && !("repuesto" in next)) all.delete("pagina");
    if ("repuesto" in next && !("editar" in next)) all.delete("editar");
    const s = all.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  // The search reaches the server once the user stops typing.
  useEffect(() => {
    if (draft.trim() === q.trim()) return;
    const timer = setTimeout(() => go({ q: draft.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (category) qs.set("category", category);
    if (low) qs.set("low", "true");
    if (out) qs.set("out", "true");
    if (brand) qs.set("brand", brand);
    if (provider) qs.set("provider", provider);
    if (page > 1) qs.set("page", String(page));
    apiFetch(`${API_URL}/inventory/list${qs.size ? `?${qs}` : ""}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) setData((await res.json()) as PartPage);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [q, category, low, out, brand, provider, page, attempt]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(q.trim() || category || low || out || brand || provider);
  const categories = data ? Object.entries(data.counts.byCategory).sort(([a], [b]) => a.localeCompare(b, "es")) : [];

  return (
    <div className={`${styles.page} ${openId ? styles.withCard : ""}`}>
      <section className={styles.listPane} aria-label="Repuestos">
        <Header
          view="repuestos"
          onNew={() => go({ repuesto: "nuevo" })}
          // A server not yet updated sends no summary: the line just waits for it.
          summary={data?.summary ? summaryLine(data.summary, formatEur) : undefined}
        />

        <input
          type="search"
          className={styles.search}
          placeholder="SKU, repuesto, modelo o marca"
          aria-label="Buscar repuesto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        <div className={styles.filters}>
          <div className={styles.chips} role="group" aria-label="Vista rápida">
            <button
              type="button"
              className={styles.chip}
              aria-pressed={!low && !out}
              onClick={() => go({ bajo: null, agotados: null })}
            >
              Todos <span className={styles.count}>{data?.counts.all ?? "–"}</span>
            </button>
            <button
              type="button"
              className={`${styles.chip} ${styles.lowChip}`}
              aria-pressed={low}
              onClick={() => go({ bajo: low ? null : "1", agotados: null })}
            >
              Stock bajo <span className={styles.count}>{data?.counts.low ?? "–"}</span>
            </button>
            <button
              type="button"
              className={`${styles.chip} ${styles.outChip}`}
              aria-pressed={out}
              onClick={() => go({ agotados: out ? null : "1", bajo: null })}
            >
              Agotados <span className={styles.count}>{data?.counts.out ?? "–"}</span>
            </button>
          </div>
          <div className={styles.menus}>
            <select aria-label="Categoría" value={category ?? ""} onChange={(e) => go({ categoria: e.target.value || null })}>
              <option value="">Categoría</option>
              {categories.map(([c, n]) => (
                <option key={c} value={c}>
                  {c} ({n})
                </option>
              ))}
            </select>
            <select aria-label="Marca" value={brand ?? ""} onChange={(e) => go({ marca: e.target.value || null })}>
              <option value="">Marca</option>
              {data?.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select aria-label="Proveedor" value={provider ?? ""} onChange={(e) => go({ proveedor: e.target.value || null })}>
              <option value="">Proveedor</option>
              {data?.providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {failed && (
          <div role="alert" className={styles.error}>
            No se ha podido cargar el inventario.{" "}
            <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
          </div>
        )}
        {!data && !failed && <p className={styles.muted}>Cargando…</p>}
        {data && data.total === 0 && (
          <div className={styles.empty}>
            {filtered ? (
              <>
                <p>Ningún repuesto coincide con estos filtros.</p>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setDraft("");
                    router.replace(pathname, { scroll: false });
                  }}
                >
                  Quitar filtros
                </button>
              </>
            ) : (
              <>
                <p>Aún no hay repuestos. Importa tu primera factura o crea uno.</p>
                <button type="button" className={styles.linkButton} onClick={() => go({ repuesto: "nuevo" })}>
                  + Nuevo repuesto
                </button>
              </>
            )}
          </div>
        )}
        {data && data.total > 0 && (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.wide}>SKU</th>
                  <th>Repuesto · compatible con</th>
                  <th className={styles.wide}>Categoría</th>
                  <th>Stock</th>
                  <th className={`${styles.num} ${styles.cost}`}>Coste</th>
                  <th className={`${styles.num} ${styles.wide}`}>Venta</th>
                  <th className={`${styles.num} ${styles.wide}`}>Margen</th>
                  <th className={styles.wide}>Ubic.</th>
                  <th className={styles.wide}>Proveedor</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr
                    key={p.id}
                    className={p.id === openId ? styles.selected : undefined}
                    onClick={() => go({ repuesto: p.id })}
                  >
                    <td className={`${styles.sku} ${styles.wide}`}>{p.sku}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.rowName}
                        onClick={(e) => {
                          e.stopPropagation();
                          go({ repuesto: p.id });
                        }}
                      >
                        {p.name}
                      </button>
                      {p.model && <span className={`${styles.muted} ${styles.compat}`}>{p.model}</span>}
                      <span className={`${styles.muted} ${styles.narrow}`}>
                        {[p.sku, p.ubication].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className={styles.wide}>{p.category ?? "—"}</td>
                    <td>
                      <StockBadge part={p} />
                    </td>
                    <td className={`${styles.num} ${styles.cost}`}>
                      {p.costPrice !== null ? formatEur(p.costPrice) : "—"}
                    </td>
                    <td className={`${styles.num} ${styles.wide}`}>
                      {Number(p.salesPrice) ? formatEur(p.salesPrice) : "—"}
                    </td>
                    <td className={`${styles.num} ${styles.wide}`}>{margin(p.salesPrice, p.costPrice)}</td>
                    <td className={styles.wide}>{p.ubication ?? "—"}</td>
                    <td className={styles.wide}>{p.provider ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.muted}>
              {data.total} {data.total === 1 ? "repuesto" : "repuestos"}
            </p>
            {pages > 1 && (
              <nav className={styles.pager} aria-label="Páginas">
                <Button
                  size="sm"
                  disabledReason={page <= 1 ? "Es la primera página" : undefined}
                  onClick={() => go({ pagina: String(page - 1) })}
                >
                  Anterior
                </Button>
                <span className={styles.muted}>
                  Página {page} de {pages}
                </span>
                <Button
                  size="sm"
                  disabledReason={page >= pages ? "Es la última página" : undefined}
                  onClick={() => go({ pagina: String(page + 1) })}
                >
                  Siguiente
                </Button>
              </nav>
            )}
          </>
        )}
      </section>

      {(creating || editing) && data && (
        <PartForm
          key={`${openId}-form`}
          id={creating ? undefined : (openId ?? undefined)}
          suggestions={{
            categories: Object.keys(data.counts.byCategory),
            brands: data.brands,
            providers: data.providers,
          }}
          onSaved={(saved) => {
            go({ repuesto: saved, editar: null });
            setAttempt((n) => n + 1);
          }}
          onCancel={() => go(creating ? { repuesto: null } : { editar: null })}
        />
      )}
      {openId && !creating && !editing && (
        <PartCard
          key={`${openId}-${attempt}`}
          id={openId}
          onEdit={() => go({ editar: "1" })}
          onClose={() => go({ repuesto: null })}
          onDeleted={() => {
            go({ repuesto: null });
            setAttempt((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
