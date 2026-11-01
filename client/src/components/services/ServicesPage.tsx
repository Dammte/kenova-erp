"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { ServiceForm } from "./ServiceForm";
import { categoryCounts, filterCatalog, modelLabel, type CatalogRow } from "./services";
import styles from "./Services.module.css";

/**
 * Design 3.5 «Servicios»: the catalog of what is charged, kept without leaving
 * the list. Rates live here too (D3). Partners only, like the menu entry.
 */
export function ServicesPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>
            <strong>Sin permiso.</strong> El catálogo de servicios lo gestionan los socios.
          </p>
          <Link href="/tarifas" className={styles.link}>
            Ir a Tarifas
          </Link>
        </div>
      </div>
    );
  }
  return <Services />;
}

function Services() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const category = params.get("categoria");
  const hideUnavailable = params.get("ocultar") === "1";
  const openId = params.get("servicio");
  const creating = openId === "nuevo";

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const go = (next: Record<string, string | null>) => {
    const all = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) all.set(k, v);
      else all.delete(k);
    }
    const s = all.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(`${API_URL}/services/catalog`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) setRows((await res.json()) as CatalogRow[]);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  const categories = rows ? categoryCounts(rows) : [];
  const shown = rows ? filterCatalog(rows, { q, category, hideUnavailable }) : [];
  const filtered = Boolean(q.trim() || category || hideUnavailable);

  return (
    <div className={`${styles.page} ${openId ? styles.withCard : ""}`}>
      <section className={styles.listPane} aria-label="Servicios">
        <header className={styles.top}>
          <h1 className={styles.title}>Servicios</h1>
          <Button variant="primary" size="sm" onClick={() => go({ servicio: "nuevo" })}>
            + Nuevo servicio
          </Button>
        </header>

        <input
          type="search"
          className={styles.search}
          placeholder="Servicio, modelo o marca: pantalla 12, bateria a54…"
          aria-label="Buscar servicio"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className={styles.filters}>
          <div className={styles.chips} role="group" aria-label="Categoría">
            <button type="button" className={styles.chip} aria-pressed={!category} onClick={() => go({ categoria: null })}>
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
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={hideUnavailable}
              onChange={(e) => go({ ocultar: e.target.checked ? "1" : null })}
            />
            Ocultar no disponibles
          </label>
        </div>

        {failed && (
          <div role="alert" className={styles.error}>
            No se ha podido cargar el catálogo.{" "}
            <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
          </div>
        )}
        {!rows && !failed && <p className={styles.muted}>Cargando…</p>}
        {rows && rows.length === 0 && (
          <div className={styles.empty}>
            <p>Aún no hay servicios. Crea el primero con «+ Nuevo servicio».</p>
          </div>
        )}
        {rows && rows.length > 0 && shown.length === 0 && (
          <div className={styles.empty}>
            <p>Ningún servicio coincide{q.trim() ? ` con «${q.trim()}»` : ""}.</p>
            {filtered && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  setQ("");
                  go({ categoria: null, ocultar: null });
                }}
              >
                Quitar filtros
              </button>
            )}
          </div>
        )}
        {shown.length > 0 && (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th className={styles.wide}>Categoría</th>
                  <th>Modelo · calidad</th>
                  <th className={styles.wide}>Tiempo</th>
                  <th className={styles.num}>Precio</th>
                  <th className={styles.wide}>Disponible</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr
                    key={s.id}
                    className={[s.id === openId ? styles.selected : "", s.available ? "" : styles.off].join(" ")}
                    onClick={() => go({ servicio: s.id })}
                  >
                    <td>
                      <button
                        type="button"
                        className={styles.rowName}
                        onClick={(e) => {
                          e.stopPropagation();
                          go({ servicio: s.id });
                        }}
                      >
                        {s.name}
                      </button>
                      {s.description && <span className={styles.sub}>{s.description}</span>}
                    </td>
                    <td className={styles.wide}>{s.category ?? "—"}</td>
                    <td>{modelLabel(s)}</td>
                    <td className={`${styles.wide} ${styles.nowrap}`}>{s.estimatedTime ?? "—"}</td>
                    <td className={styles.num}>{formatEur(s.price)}</td>
                    <td className={styles.wide}>
                      <span className={s.available ? styles.on : styles.offText}>
                        {s.available ? "Disponible" : "No disponible"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.muted}>
              {shown.length} {shown.length === 1 ? "servicio" : "servicios"}
              {shown.length !== rows?.length ? ` de ${rows?.length}` : ""}
            </p>
          </>
        )}
      </section>

      {openId && rows && (
        <ServiceForm
          key={`${openId}-${attempt}`}
          id={creating ? undefined : openId}
          categories={categories.map(([c]) => c)}
          onSaved={(saved) => {
            go({ servicio: saved });
            setAttempt((n) => n + 1);
          }}
          onCancel={() => go({ servicio: null })}
        />
      )}
    </div>
  );
}
