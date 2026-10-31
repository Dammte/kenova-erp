"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { ClientCard } from "./ClientCard";
import { formatDay, formatDoc, formatPhone, fullName, type ClientPage } from "./clients";
import styles from "./Clients.module.css";

/**
 * Design 3.3: find a client, see what they brought and owe, and act without
 * leaving the page. List and card side by side; the open client, the tab,
 * the search and the page live in the address.
 */
export function ClientsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const archived = params.get("archivados") === "1";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("pagina")) || 1);
  const openId = params.get("cliente");

  const [draft, setDraft] = useState(q);
  const [data, setData] = useState<ClientPage | null>(null);
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

  // The search reaches the server once the user stops typing.
  useEffect(() => {
    if (draft.trim() === q.trim()) return;
    const timer = setTimeout(() => go({ q: draft.trim() || null, pagina: null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    if (archived) qs.set("archived", "true");
    if (page > 1) qs.set("page", String(page));
    apiFetch(`${API_URL}/clients/list${qs.size ? `?${qs}` : ""}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) setData((await res.json()) as ClientPage);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [q, archived, page, attempt]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reload = () => setAttempt((n) => n + 1);

  return (
    <div className={`${styles.page} ${openId ? styles.withCard : ""}`}>
      <section className={styles.listPane} aria-label="Clientes">
        <h1 className={styles.title}>Clientes</h1>
        <input
          type="search"
          className={styles.search}
          placeholder="Nombre, teléfono, documento o email"
          aria-label="Buscar cliente"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className={styles.tabs} role="tablist">
          {[false, true].map((a) => (
            <button
              key={String(a)}
              type="button"
              role="tab"
              aria-selected={archived === a}
              className={styles.tab}
              onClick={() => go({ archivados: a ? "1" : null, pagina: null })}
            >
              {a ? "Archivados" : "Activos"}
            </button>
          ))}
        </div>

        {failed && (
          <div role="alert" className={styles.error}>
            No se han podido cargar los clientes.{" "}
            <Button size="sm" onClick={reload}>
              Reintentar
            </Button>
          </div>
        )}
        {!data && !failed && <p className={styles.muted}>Cargando…</p>}
        {data && data.total === 0 && (
          <div className={styles.empty}>
            {q.trim() ? (
              <p>Ningún cliente coincide con «{q.trim()}».</p>
            ) : archived ? (
              <p>No hay clientes archivados.</p>
            ) : (
              <>
                <p>Los clientes se crean al dar de alta un equipo.</p>
                <Link href="/ordenes/nueva" className={styles.link}>
                  Ir a Alta rápida
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
                  <th>Cliente</th>
                  <th className={`${styles.num} ${styles.wide}`}>Órd.</th>
                  <th>Últ. visita</th>
                  <th className={styles.num}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => (
                  <tr
                    key={c.id}
                    className={c.id === openId ? styles.selected : undefined}
                    onClick={() => go({ cliente: c.id })}
                  >
                    <td>
                      <button
                        type="button"
                        className={styles.rowName}
                        onClick={(e) => {
                          e.stopPropagation();
                          go({ cliente: c.id });
                        }}
                      >
                        {fullName(c)}
                      </button>
                      {c.duplicate && <span className={styles.dupChip}>¿Duplicado?</span>}
                      <span className={styles.muted}>
                        {formatPhone(c.phoneNumber)}
                        <span className={styles.wide}> · {formatDoc(c)}</span>
                      </span>
                    </td>
                    <td className={`${styles.num} ${styles.wide}`}>{c.orders}</td>
                    <td>{formatDay(c.lastVisit)}</td>
                    <td className={`${styles.num} ${Number(c.balance) > 0 ? styles.owed : ""}`}>
                      {Number(c.balance) > 0 ? formatEur(c.balance) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.muted}>
              {data.total} {data.total === 1 ? "cliente" : "clientes"} {archived ? "archivados" : "activos"}
            </p>
            {pages > 1 && (
              <nav className={styles.pager} aria-label="Páginas">
                <Button size="sm" disabledReason={page <= 1 ? "Es la primera página" : undefined} onClick={() => go({ pagina: String(page - 1) })}>
                  Anterior
                </Button>
                <span className={styles.muted}>
                  Página {page} de {pages}
                </span>
                <Button size="sm" disabledReason={page >= pages ? "Es la última página" : undefined} onClick={() => go({ pagina: String(page + 1) })}>
                  Siguiente
                </Button>
              </nav>
            )}
          </>
        )}
      </section>

      {openId && <ClientCard key={openId} id={openId} onClose={() => go({ cliente: null })} onChanged={reload} />}
    </div>
  );
}
