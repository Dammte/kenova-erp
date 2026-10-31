"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { QuoteForm } from "./QuoteForm";
import { QuoteView } from "./QuoteView";
import {
  QUOTE_STATUS_LABEL,
  QUOTE_TABS,
  formatDay,
  type QuoteDetail,
  type QuoteListPage,
  type QuoteTab,
} from "./quotes";
import styles from "./Quotes.module.css";

const SEARCH_DELAY_MS = 300;
/** ?presupuesto= value that opens the form for a new one. */
export const NEW_QUOTE = "nuevo";

function useQuoteList(tab: QuoteTab, q: string, reload: number) {
  const [data, setData] = useState<QuoteListPage | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams();
    if (tab !== "all") qs.set("tab", tab);
    if (q.trim()) qs.set("q", q.trim());
    const s = qs.toString();
    apiFetch(`${API_URL}/quotes${s ? `?${s}` : ""}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as QuoteListPage);
        setFailed(false);
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, [tab, q, reload]);
  return { data, failed };
}

function useQuote(id: string | null, reload: number) {
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setQuote(null);
    setFailed(false);
    if (!id || id === NEW_QUOTE) return;
    let live = true;
    apiFetch(`${API_URL}/quotes/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) setQuote((await res.json()) as QuoteDetail);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id, reload]);
  return { quote, failed };
}

/**
 * Design 2.4: the list and the open quote side by side, so the sent ones can
 * be gone through one by one. The open quote lives in the address.
 */
export function QuotesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("presupuesto");
  const [tab, setTab] = useState<QuoteTab>("all");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const { data, failed } = useQuoteList(tab, q, reload);
  const { quote, failed: quoteFailed } = useQuote(openId, reload);

  useEffect(() => {
    const timer = setTimeout(() => setQ(draft), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => setEditing(false), [openId]);

  const open = (id: string | null) =>
    router.replace(id ? `${pathname}?presupuesto=${id}` : pathname, { scroll: false });
  const saved = (q: QuoteDetail) => {
    setEditing(false);
    setReload((n) => n + 1);
    open(q.id);
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <h1 className={styles.title}>Presupuestos</h1>
        <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => open(NEW_QUOTE)}>
          Nuevo
        </Button>
      </header>

      <div className={styles.split}>
        <section className={styles.listCol} aria-label="Lista de presupuestos">
          <nav className={styles.tabs} aria-label="Estados">
            {QUOTE_TABS.map((t) => (
              <button
                key={t.tab}
                type="button"
                className={styles.tab}
                aria-current={tab === t.tab ? "page" : undefined}
                onClick={() => setTab(t.tab)}
              >
                {t.label}
                <span className={styles.count}>{data?.counts[t.tab] ?? 0}</span>
              </button>
            ))}
          </nav>
          <div className={styles.searchBox}>
            <Search size={18} aria-hidden className={styles.searchIcon} />
            <input
              type="search"
              className={styles.search}
              aria-label="Buscar presupuesto"
              placeholder="Número, nombre, teléfono o modelo"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          {failed && (
            <p role="alert" className={styles.error}>
              No se han podido cargar los presupuestos. Prueba otra vez.
            </p>
          )}
          {data && data.rows.length === 0 && (
            <div className={styles.empty}>
              {data.counts.all === 0 ? (
                <>
                  <p>Aún no hay presupuestos</p>
                  <p className={styles.muted}>Créalos aquí con «Nuevo».</p>
                </>
              ) : (
                <p className={styles.muted}>Ningún presupuesto coincide.</p>
              )}
            </div>
          )}
          <ul className={styles.list}>
            {data?.rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={styles.row}
                  aria-current={openId === r.id ? "true" : undefined}
                  onClick={() => open(r.id)}
                >
                  <span className={styles.rowHead}>
                    <strong>{r.code}</strong>
                    <span className={styles.status} data-status={r.status}>
                      {QUOTE_STATUS_LABEL[r.status]}
                    </span>
                    <strong className={styles.num}>{formatEur(r.total)}</strong>
                  </span>
                  <span>{r.clientName}</span>
                  <span className={styles.muted}>
                    {r.device} · hasta {formatDay(r.validUntil)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.detailCol} aria-label="Presupuesto abierto">
          {openId === NEW_QUOTE && <QuoteForm onSaved={saved} onCancel={() => open(null)} />}
          {quote && editing && <QuoteForm quote={quote} onSaved={saved} onCancel={() => setEditing(false)} />}
          {quote && !editing && <QuoteView quote={quote} onEdit={() => setEditing(true)} />}
          {quoteFailed && (
            <p role="alert" className={styles.error}>
              No se ha podido abrir el presupuesto.
            </p>
          )}
          {!openId && <p className={styles.muted}>Elige un presupuesto de la lista o crea uno nuevo.</p>}
        </section>
      </div>
    </div>
  );
}
