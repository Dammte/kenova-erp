"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { PartCard } from "./PartCard";
import { PartOrders } from "./PartOrders";
import { StockBadge } from "./StockBadge";
import { skuTag, type PartPage } from "./inventory";
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
            <strong>Sin permiso.</strong> El inventario lo gestionan los socios.
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

type View = "repuestos" | "pedidos";

function Inventory() {
  const view: View = useSearchParams().get("vista") === "pedidos" ? "pedidos" : "repuestos";
  if (view === "repuestos") return <PartsList />;
  return (
    <div className={styles.page}>
      <section className={styles.listPane} aria-label="Pedidos de piezas">
        <Header view={view} />
        <PartOrders />
      </section>
    </div>
  );
}

/** Title, actions and the Repuestos / Pedidos tabs; switching starts clean. */
function Header({ view }: { view: View }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <>
      <header className={styles.top}>
        <h1 className={styles.title}>Inventario</h1>
        <div className={styles.headActions}>
          <Link href="/inventory" className={styles.secondaryLink}>
            Importar factura (PDF)
          </Link>
          <Link href="/inventory/add-part" className={styles.primaryLink}>
            + Nuevo repuesto
          </Link>
        </div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Vista">
        {(
          [
            ["repuestos", "Repuestos"],
            ["pedidos", "Pedidos"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={styles.tab}
            onClick={() => router.replace(v === "pedidos" ? `${pathname}?vista=pedidos` : pathname, { scroll: false })}
          >
            {label}
          </button>
        ))}
      </div>
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
  const brand = params.get("marca");
  const provider = params.get("proveedor");
  const page = Math.max(1, Number(params.get("pagina")) || 1);
  const openId = params.get("repuesto");

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
  }, [q, category, low, brand, provider, page, attempt]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(q.trim() || category || low || brand || provider);
  const categories = data ? Object.entries(data.counts.byCategory).sort(([a], [b]) => a.localeCompare(b, "es")) : [];

  return (
    <div className={`${styles.page} ${openId ? styles.withCard : ""}`}>
      <section className={styles.listPane} aria-label="Repuestos">
        <Header view="repuestos" />

        <input
          type="search"
          className={styles.search}
          placeholder="SKU, repuesto, modelo o marca"
          aria-label="Buscar repuesto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        <div className={styles.filters}>
          <div className={styles.chips} role="group" aria-label="Categoría">
            <button
              type="button"
              className={styles.chip}
              aria-pressed={!category}
              onClick={() => go({ categoria: null })}
            >
              Todas
            </button>
            {categories.map(([c, n]) => (
              <button
                key={c}
                type="button"
                className={styles.chip}
                aria-pressed={category === c}
                onClick={() => go({ categoria: category === c ? null : c })}
              >
                {c} <span className={styles.count}>{n}</span>
              </button>
            ))}
            <button
              type="button"
              className={`${styles.chip} ${styles.lowChip}`}
              aria-pressed={low}
              onClick={() => go({ bajo: low ? null : "1" })}
            >
              Stock bajo · {data?.counts.low ?? "…"}
            </button>
          </div>
          <div className={styles.menus}>
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
                <Link href="/inventory/add-part" className={styles.link}>
                  + Nuevo repuesto
                </Link>
              </>
            )}
          </div>
        )}
        {data && data.total > 0 && (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th aria-label="Categoría" />
                  <th className={styles.wide}>SKU</th>
                  <th>Repuesto</th>
                  <th className={styles.wide}>Compatible</th>
                  <th className={styles.wide}>Ubicación</th>
                  <th>Stock</th>
                  <th className={styles.wide}>Proveedor</th>
                  <th className={`${styles.num} ${styles.wide}`}>Venta</th>
                  <th className={`${styles.num} ${styles.cost}`}>Coste</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr
                    key={p.id}
                    className={p.id === openId ? styles.selected : undefined}
                    onClick={() => go({ repuesto: p.id })}
                  >
                    <td>
                      <span className={styles.tag} aria-hidden>
                        {skuTag(p.sku)}
                      </span>
                    </td>
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
                      <span className={`${styles.muted} ${styles.narrow}`}>
                        {[p.sku, p.ubication].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className={styles.wide}>{p.model ?? "—"}</td>
                    <td className={styles.wide}>{p.ubication ?? "—"}</td>
                    <td>
                      <StockBadge part={p} />
                    </td>
                    <td className={styles.wide}>{p.provider ?? "—"}</td>
                    <td className={`${styles.num} ${styles.wide}`}>
                      {Number(p.salesPrice) ? formatEur(p.salesPrice) : "—"}
                    </td>
                    <td className={`${styles.num} ${styles.cost}`}>
                      {p.costPrice !== null ? formatEur(p.costPrice) : "—"}
                    </td>
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

      {openId && <PartCard key={openId} id={openId} onClose={() => go({ repuesto: null })} />}
    </div>
  );
}
