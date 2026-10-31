"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Search } from "lucide-react";
import { Button, StatusChip } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  EMPTY_TAB,
  FAULT_LABEL,
  PAYMENT_LABEL,
  PRIORITY_LABEL,
  TABS,
  daysLevel,
  queryString,
  readQuery,
  type ListQuery,
  type OrderListPage,
  type OrderRow,
} from "./orderList";
import styles from "./OrderList.module.css";

/** Where a row leads until the order panel (design 1.5) exists. */
export const orderHref = (id: string) => `/serviceOrders/${id}`;
export const NEW_ORDER_HREF = "/serviceOrders/newServiceOrder";

const SEARCH_DELAY_MS = 300;

/** Fetches one page for the query; while a new page loads the old one stays. */
function useOrderPage(query: ListQuery) {
  const [data, setData] = useState<OrderListPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const qs = queryString(query);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    apiFetch(`${API_URL}/service-orders/list${qs ? `?${qs}` : ""}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as OrderListPage);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [qs, attempt]);

  return { data, loading, failed, retry: () => setAttempt((n) => n + 1) };
}

/**
 * Design 1.4: every order of the store, by tab, with the search and the money
 * owed. The tab, search and page live in the address, so coming back from an
 * order keeps them.
 */
export default function OrderList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = readQuery(new URLSearchParams(params.toString()));
  const { data, loading, failed, retry } = useOrderPage(query);
  const [draft, setDraft] = useState(query.q);
  const searchRef = useRef<HTMLInputElement>(null);
  // The search last sent to the address; anything else there (a menu link to
  // the bare list, say) replaces what is typed.
  const sentQ = useRef(query.q);
  if (query.q !== sentQ.current) {
    sentQ.current = query.q;
    if (draft !== query.q) setDraft(query.q);
  }

  const go = useCallback(
    (next: Partial<ListQuery>) => {
      const qs = queryString({ ...query, page: 1, ...next });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [query, pathname, router],
  );

  // The search reaches the server once the user stops typing.
  useEffect(() => {
    if (draft.trim() === query.q.trim()) return;
    const timer = setTimeout(() => {
      sentQ.current = draft.trim();
      go({ q: draft });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, query.q, go]);

  // "/" focuses the search from anywhere in the list.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Enter opens the order when the search is exactly its number.
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const exact = data?.rows.find((r) => r.code.toLowerCase() === draft.trim().toLowerCase());
    if (exact) router.push(orderHref(exact.id));
  };

  const clearFilters = () => {
    sentQ.current = "";
    setDraft("");
    go({ q: "", debt: false });
  };

  const rows = data?.rows ?? [];
  const filtered = Boolean(query.q.trim()) || query.debt;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Órdenes</h1>

      <nav className={styles.tabs} aria-label="Estado de las órdenes">
        {TABS.map(({ tab, label }) => (
          <button
            key={tab}
            type="button"
            className={styles.tab}
            aria-current={query.tab === tab ? "page" : undefined}
            onClick={() => go({ tab })}
          >
            {label}
            <span className={styles.count}>{data?.counts[tab] ?? "–"}</span>
          </button>
        ))}
      </nav>

      <div className={styles.filters}>
        <label className={styles.search}>
          <Search size={16} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Nº, nombre, teléfono, modelo o IMEI"
            aria-label="Buscar órdenes"
          />
          <kbd className={styles.kbd} aria-hidden>
            /
          </kbd>
        </label>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={query.debt}
          onClick={() => go({ debt: !query.debt })}
        >
          Con saldo pendiente
        </button>
      </div>

      {failed ? (
        <div className={styles.error} role="alert">
          <AlertTriangle size={16} aria-hidden />
          No se ha podido cargar la lista. Comprueba la conexión.
          <Button size="sm" onClick={retry}>
            Reintentar
          </Button>
        </div>
      ) : data && rows.length === 0 && !loading ? (
        <div className={styles.empty}>
          {filtered ? (
            <>
              <p className={styles.emptyTitle}>
                {query.q.trim()
                  ? `Ninguna orden coincide con «${query.q.trim()}»`
                  : "Ninguna orden tiene saldo pendiente"}
                {query.q.trim() && query.debt ? " y el filtro «Con saldo pendiente»." : "."}
              </p>
              <div className={styles.emptyActions}>
                <Button size="sm" onClick={clearFilters}>
                  Quitar filtros
                </Button>
                <Link href={NEW_ORDER_HREF} className={styles.link}>
                  Nueva alta
                </Link>
              </div>
            </>
          ) : (
            <p className={styles.emptyTitle}>{EMPTY_TAB[query.tab]}</p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap} aria-busy={loading}>
          <table className={`${styles.table} ${loading ? styles.stale : ""}`}>
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Cliente</th>
                <th scope="col">Dispositivo · avería</th>
                <th scope="col" className={styles.wide}>
                  Servicios
                </th>
                <th scope="col" className={styles.wide}>
                  Prioridad
                </th>
                <th scope="col">Estado</th>
                <th scope="col">Pago</th>
                <th scope="col" className={styles.num}>
                  Días
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.id} row={row} onOpen={() => router.push(orderHref(row.id))} />
              ))}
            </tbody>
          </table>
          {data && <Pager data={data} onPage={(page) => go({ page })} />}
        </div>
      )}
    </div>
  );
}

function Row({ row, onOpen }: { row: OrderRow; onOpen: () => void }) {
  const faults = row.faults.map((f) => FAULT_LABEL[f] ?? f).join(", ");
  const [firstService, ...moreServices] = row.services;
  return (
    <tr className={styles.row} onClick={onOpen}>
      <td className={styles.code}>
        <Link
          href={orderHref(row.id)}
          className={`${styles.codeLink} ${styles[`p_${row.priority}`]}`}
          onClick={(e) => e.stopPropagation()}
        >
          {row.code}
        </Link>
      </td>
      <td className={styles.client}>
        <span className={styles.strong}>{row.clientName}</span>
        {row.phoneNumber && <span className={styles.muted}>{row.phoneNumber}</span>}
      </td>
      <td className={styles.device}>
        <span className={styles.strong}>{row.device || "Sin dispositivo"}</span>
        {faults && <span className={styles.muted}>{faults}</span>}
      </td>
      <td className={styles.wide}>
        {firstService ?? <span className={styles.muted}>—</span>}
        {moreServices.length > 0 && (
          <span className={styles.more} title={row.services.join("\n")}>
            +{moreServices.length}
          </span>
        )}
      </td>
      <td className={styles.wide}>
        <span className={`${styles.priority} ${styles[`p_${row.priority}`]}`}>
          {PRIORITY_LABEL[row.priority]}
        </span>
      </td>
      <td className={styles.status}>
        <StatusChip status={row.status} />
      </td>
      <td className={styles.payment}>
        <span>{row.paymentStatus ? PAYMENT_LABEL[row.paymentStatus] : "—"}</span>
        {row.balance > 0 && <span className={styles.debt}>Debe {formatEur(row.balance)}</span>}
      </td>
      <td className={`${styles.num} ${styles.daysCell}`}>
        <Days row={row} />
      </td>
    </tr>
  );
}

function Days({ row }: { row: OrderRow }) {
  if (row.days === null) return <span className={styles.muted}>—</span>;
  const level = daysLevel(row.days);
  const Icon = level === "danger" ? AlertTriangle : Clock;
  return (
    <span className={`${styles.days} ${styles[level]}`}>
      {level !== "normal" && <Icon size={14} aria-hidden />}
      <span aria-label={`${row.days} días${row.uncollected ? " sin recoger" : " en taller"}`}>
        {row.days}
      </span>
      {row.uncollected && <span className={styles.uncollected}>sin recoger</span>}
    </span>
  );
}

function Pager({ data, onPage }: { data: OrderListPage; onPage: (page: number) => void }) {
  if (data.total === 0) return null;
  const from = (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.page * data.pageSize, data.total);
  const last = Math.ceil(data.total / data.pageSize);
  const n = new Intl.NumberFormat("es-ES");
  return (
    <div className={styles.pager}>
      <span>
        {n.format(from)}–{n.format(to)} de {n.format(data.total)}
      </span>
      {/* Only the moves that exist, so no button sits disabled. */}
      <span className={styles.pagerButtons}>
        {data.page > 1 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<ChevronLeft size={16} aria-hidden />}
            onClick={() => onPage(data.page - 1)}
          >
            Anterior
          </Button>
        )}
        {data.page < last && (
          <Button size="sm" variant="ghost" onClick={() => onPage(data.page + 1)}>
            Siguiente
            <ChevronRight size={16} aria-hidden />
          </Button>
        )}
      </span>
    </div>
  );
}
