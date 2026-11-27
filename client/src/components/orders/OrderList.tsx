"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Search } from "lucide-react";
import { Button, STATUS_LABEL, type OrderStatus } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  EMPTY_TAB,
  EMPTY_VIEW,
  FAULT_LABEL,
  PRIORITY_LABEL,
  TABS,
  VIEWS,
  daysLevel,
  noticeAgo,
  queryString,
  readQuery,
  type ListQuery,
  type OrderListPage,
  type OrderRow,
} from "./orderList";
import { Toast } from "@/components/feedback/Toast";
import OrderPanel from "./OrderPanel";
import { QUICK_STATUSES, StatusMenu } from "./StatusMenu";
import { FinishDialog } from "./FinishDialog";
import styles from "./OrderList.module.css";

/** The order's own page, for what the panel cannot do yet. */
export const orderHref = (id: string) => `/ordenes/${id}`;
export const NEW_ORDER_HREF = "/ordenes/nueva";

const SEARCH_DELAY_MS = 300;
interface ToastMessage {
  /** A new one restarts the toast's time. */
  seq: number;
  text: string;
  undo?: () => void;
  error?: boolean;
}

/** PATCHes the status; resolves to the server's message when it refuses. */
async function saveStatus(id: string, status: OrderStatus): Promise<string | null> {
  try {
    const res = await apiFetch(`${API_URL}/service-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return res.ok ? null : await errorMessage(res, "El servidor no lo ha aceptado.");
  } catch {
    return "Comprueba la conexión.";
  }
}

/** POST /service-orders/bulk-status: what happened to each order (design R3 B4). */
export interface BulkResult {
  changed: { id: string; code: string }[];
  unchanged: { id: string; code: string }[];
  failed: { id: string; code: string | null; reason: string }[];
}

/** «2 órdenes pasan a En progreso. MP-0141 no: está entregada…». */
export function bulkMessage(r: BulkResult, label: string): string {
  const n = r.changed.length;
  const parts = [
    n ? `${n} ${n === 1 ? "orden pasa" : "órdenes pasan"} a ${label}.` : `Ninguna orden ha cambiado.`,
    r.unchanged.length ? `${r.unchanged.length} ya ${r.unchanged.length === 1 ? "estaba" : "estaban"} así.` : "",
    ...r.failed.map((f) => `${f.code ?? "Una orden"} no: ${f.reason}.`.replace(/\.\.$/, ".")),
  ];
  return parts.filter(Boolean).join(" ");
}

/** Fetches one page for the query; while a new page loads the old one stays. */
function useOrderPage(query: ListQuery) {
  const [data, setData] = useState<OrderListPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const qs = queryString(query, true);

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
  // Statuses just changed here, shown until the list comes back with them.
  const [moved, setMoved] = useState<Record<string, OrderStatus>>({});
  const [toast, setToastState] = useState<ToastMessage | null>(null);
  const toastSeq = useRef(0);
  const setToast = (t: Omit<ToastMessage, "seq"> | null) =>
    setToastState(t ? { ...t, seq: ++toastSeq.current } : null);
  useEffect(() => setMoved({}), [data]);
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

  // The open order lives in the address too (?orden=), so it survives a reload.
  const openId = params.get("orden");
  const panelHref = (id: string | null) => {
    const qs = queryString(query);
    const all = new URLSearchParams(qs);
    if (id) all.set("orden", id);
    const s = all.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const openOrder = (id: string | null) => router.replace(panelHref(id), { scroll: false });
  // Design 4: closing the panel puts the focus back on the order's row.
  const closeOrder = (id: string) => {
    openOrder(null);
    requestAnimationFrame(() =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-order-link]"))
        .find((a) => a.dataset.orderLink === id)
        ?.focus(),
    );
  };

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
    if (exact) openOrder(exact.id);
  };

  const changeStatus = async (row: OrderRow, from: OrderStatus, to: OrderStatus, undoable = true) => {
    setMoved((m) => ({ ...m, [row.id]: to }));
    const refused = await saveStatus(row.id, to);
    if (refused) {
      setMoved((m) => ({ ...m, [row.id]: from }));
      setToast({
        text: `No se ha podido cambiar ${row.code} a ${STATUS_LABEL[to]}. ${refused}`,
        error: true,
      });
      return;
    }
    setToast(
      undoable
        ? {
            text: `${row.code} pasa a ${STATUS_LABEL[to]}.`,
            undo: () => {
              setToast(null);
              void changeStatus(row, to, from, false);
            },
          }
        : { text: `${row.code} vuelve a ${STATUS_LABEL[to]}.` },
    );
    retry();
  };

  const clearFilters = () => {
    sentQ.current = "";
    setDraft("");
    go({ q: "", view: null });
  };

  const [finishing, setFinishing] = useState<OrderRow | null>(null);
  const rows = data?.rows ?? [];

  // Design R3 B4: orders picked in this page, for one action on all of them.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<OrderStatus | null>(null);
  const listKey = queryString(query);
  useEffect(() => setPicked(new Set()), [listKey]);
  const pickedRows = rows.filter((r) => picked.has(r.id));
  const allPicked = rows.length > 0 && pickedRows.length === rows.length;
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulkStatus = async (to: OrderStatus) => {
    if (bulkBusy) return;
    setBulkBusy(to);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: pickedRows.map((r) => r.id), status: to }),
      });
      if (!res.ok) {
        setToast({ text: await errorMessage(res, "No se ha cambiado ninguna orden."), error: true });
        return;
      }
      const result = (await res.json()) as BulkResult;
      setToast({ text: bulkMessage(result, STATUS_LABEL[to]), error: result.failed.length > 0 });
      // What did not move stays picked, to look at it or try something else.
      setPicked(new Set(result.failed.map((f) => f.id)));
      retry();
    } catch {
      setToast({ text: "No se ha cambiado ninguna orden. Comprueba la conexión.", error: true });
    } finally {
      setBulkBusy(null);
    }
  };
  const filtered = Boolean(query.q.trim()) || Boolean(query.view);

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
        {/* Design R3 3.1: quick views of what needs doing today. */}
        <div className={styles.views} role="group" aria-label="Vistas rápidas">
          {VIEWS.map(({ view, label }) => (
            <button
              key={view}
              type="button"
              className={styles.toggle}
              aria-pressed={query.view === view}
              onClick={() => go({ view: query.view === view ? null : view })}
            >
              {label}
              {data?.views && <span className={styles.viewCount}>{data.views[view]}</span>}
            </button>
          ))}
        </div>
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
                  : query.view && EMPTY_VIEW[query.view]}
                {query.q.trim() && query.view
                  ? ` en «${VIEWS.find((v) => v.view === query.view)?.label}».`
                  : "."}
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
                <th scope="col" className={styles.pick}>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las de esta página"
                    checked={allPicked}
                    ref={(el) => {
                      if (el) el.indeterminate = pickedRows.length > 0 && !allPicked;
                    }}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
                <th scope="col">Nº</th>
                <th scope="col">Cliente</th>
                <th scope="col">Equipo · avería</th>
                <th scope="col">Estado</th>
                <th scope="col" className={styles.num}>
                  Total · saldo
                </th>
                <th scope="col" className={styles.num}>
                  Días · entrada
                </th>
                <th scope="col" className={styles.wide}>
                  Último aviso
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row
                  key={row.id}
                  row={{ ...row, status: moved[row.id] ?? row.status }}
                  href={panelHref(row.id)}
                  open={row.id === openId}
                  onOpen={() => openOrder(row.id)}
                  onStatus={(from, to) => void changeStatus(row, from, to)}
                  onFinish={() => setFinishing(row)}
                  picked={picked.has(row.id)}
                  onPick={() => togglePick(row.id)}
                />
              ))}
            </tbody>
          </table>
          {data && <Pager data={data} onPage={(page) => go({ page })} />}
        </div>
      )}

      {pickedRows.length > 0 && (
        <div className={styles.bulkBar} role="region" aria-label="Acciones en lote">
          <span className={styles.strong}>
            {pickedRows.length} {pickedRows.length === 1 ? "seleccionada" : "seleccionadas"}
          </span>
          <span className={styles.muted}>Cambiar estado a</span>
          {QUICK_STATUSES.map((st) => (
            <Button key={st} size="sm" loading={bulkBusy === st} loadingText="Cambiando…" onClick={() => void bulkStatus(st)}>
              {STATUS_LABEL[st]}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}

      {openId && (
        <OrderPanel
          key={openId}
          id={openId}
          code={rows.find((r) => r.id === openId)?.code}
          fullHref={orderHref(openId)}
          justCreated={params.get("creada") === "1"}
          onClose={() => closeOrder(openId)}
          onChanged={retry}
        />
      )}

      {finishing && (
        <FinishDialog
          row={finishing}
          onClose={() => setFinishing(null)}
          onFinished={retry}
          onOpen={() => {
            setFinishing(null);
            openOrder(finishing.id);
          }}
        />
      )}

      {toast && (
        <Toast
          key={toast.seq}
          text={toast.text}
          undo={toast.undo}
          error={toast.error}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}

function Row({
  row,
  href,
  open,
  onOpen,
  onStatus,
  onFinish,
  picked,
  onPick,
}: {
  row: OrderRow;
  /** Picked for a batch action (design R3 B4). */
  picked: boolean;
  onPick: () => void;
  /** Opens the order's panel; the number links there too, for the keyboard. */
  href: string;
  /** Its panel is open: the row stays marked. */
  open: boolean;
  onOpen: () => void;
  onStatus: (from: OrderStatus, to: OrderStatus) => void;
  /** «Finalizar…» in the status menu: its dialog opens over the list. */
  onFinish: () => void;
}) {
  const faults = row.faults.map((f) => FAULT_LABEL[f] ?? f).join(", ");
  // Design R3: the services go after the fault, counted when there are several.
  const services =
    row.services.length === 0 ? "" : row.services.length === 1 ? row.services[0] : `${row.services.length} servicios`;
  const problem = [faults, services].filter(Boolean).join(" · ");
  return (
    <tr className={`${styles.row} ${open ? styles.rowOpen : ""} ${picked ? styles.rowPicked : ""}`} onClick={onOpen}>
      <td className={styles.pick} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label={`Seleccionar ${row.code}`} checked={picked} onChange={onPick} />
      </td>
      <td className={styles.code}>
        <Link
          href={href}
          replace
          scroll={false}
          className={`${styles.codeLink} ${styles[`p_${row.priority}`]}`}
          data-order-link={row.id}
          aria-current={open ? "true" : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {row.code}
        </Link>
        {row.warrantyOf ? (
          <span className={styles.warranty}>Garantía de {row.warrantyOf}</span>
        ) : (
          // Priority as the number's edge and in words, so it does not rely on colour.
          <span className={`${styles.priority} ${styles[`p_${row.priority}`]}`}>{PRIORITY_LABEL[row.priority]}</span>
        )}
      </td>
      <td className={styles.client}>
        <span className={styles.strong}>{row.clientName}</span>
        {row.phoneNumber && <span className={styles.muted}>{row.phoneNumber}</span>}
      </td>
      <td className={styles.device}>
        <span className={styles.strong}>{row.device || "Sin dispositivo"}</span>
        {problem && (
          <span className={styles.muted} title={row.services.length > 1 ? row.services.join("\n") : undefined}>
            {problem}
          </span>
        )}
      </td>
      <td className={styles.status}>
        <StatusMenu
          code={row.code}
          status={row.status}
          onChange={(to) => onStatus(row.status, to)}
          onFinish={onFinish}
          onOpen={onOpen}
        />
      </td>
      <td className={`${styles.num} ${styles.payment}`}>
        <span className={styles.total}>{formatEur(row.totalPrice)}</span>
        {row.balance > 0 ? (
          <span className={styles.debt}>Debe {formatEur(row.balance)}</span>
        ) : (
          row.paymentStatus === "paid" && row.totalPrice > 0 && <span className={styles.paid}>Pagado</span>
        )}
      </td>
      <td className={`${styles.num} ${styles.daysCell}`}>
        <Days row={row} />
        <span className={styles.entry}>{entryDay(row.createdAt)}</span>
      </td>
      <td className={`${styles.wide} ${styles.notice}`}>
        <LastNotice row={row} />
      </td>
    </tr>
  );
}

/** Entry day as dd/mm in Madrid (some ICU builds drop the leading zero). */
const entryDay = (iso: string) => {
  const parts = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "numeric", timeZone: "Europe/Madrid" }).formatToParts(
    new Date(iso),
  );
  const part = (type: string) => (parts.find((p) => p.type === type)?.value ?? "").padStart(2, "0");
  return `${part("day")}/${part("month")}`;
};

/** «Último aviso»: a finished order nobody has told the client about stands out. */
function LastNotice({ row }: { row: OrderRow }) {
  if (row.lastNoticeAt) return <span className={styles.muted}>{noticeAgo(row.lastNoticeAt)}</span>;
  if (row.status === "finalizado") return <span className={styles.warning}>Sin avisar</span>;
  return <span className={styles.muted}>—</span>;
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
