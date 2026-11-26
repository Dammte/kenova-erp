"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatDay } from "@/components/stores/stores";
import {
  STATES,
  STATE_LABEL,
  linesTotal,
  money,
  shortDate,
  syncSummary,
  type OrderPage,
  type OrderState,
  type SupplierOrder,
} from "./orders";
import type { SupplierData } from "./suppliers";
import stores from "../stores/Stores.module.css";
import own from "./Suppliers.module.css";
import { SuppliersTabs } from "./SuppliersTabs";

const styles = { ...stores, ...own };

/** Administrator only, like the suppliers. */
export function SupplierOrdersPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>
            <strong>Sin permiso.</strong> Los pedidos a proveedores los gestiona el administrador.
          </p>
          <Link href="/panel" className={styles.link}>
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }
  return <Orders />;
}

function Orders() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const supplierId = params.get("proveedor") ?? "";
  const state = (params.get("estado") ?? "") as OrderState | "";
  const open = params.get("pedido");
  const [q, setQ] = useState(params.get("q") ?? "");

  const [suppliers, setSuppliers] = useState<SupplierData[] | null>(null);
  const [data, setData] = useState<OrderPage | null>(null);
  // «Ver más» counts pages within one filter; another filter starts again at 1.
  const filterKey = [supplierId, state, params.get("q") ?? ""].join("|");
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const setPage = (next: number) => setPaging({ key: filterKey, page: next });
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  const go = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    apiFetch(`${API_URL}/suppliers`)
      .then(async (res) => (res.ok ? setSuppliers((await res.json()) as SupplierData[]) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [reload]);

  // The search waits for a pause in typing.
  const search = params.get("q") ?? "";
  useEffect(() => {
    const t = setTimeout(() => q.trim() !== search && go({ q: q.trim() || null, pedido: null }), 300);
    return () => clearTimeout(t);
  }, [q, search, go]);

  useEffect(() => {
    let live = true;
    const query = new URLSearchParams();
    if (supplierId) query.set("supplierId", supplierId);
    if (state) query.set("state", state);
    if (search) query.set("q", search);
    if (page > 1) query.set("page", String(page));
    setFailed(false);
    apiFetch(`${API_URL}/supplier-orders?${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as OrderPage;
        if (!live) return;
        // «Ver más» adds the next page under the ones already shown.
        setData((prev) => (page > 1 && prev ? { ...next, items: [...prev.items, ...next.items] } : next));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [supplierId, state, search, page, reload]);

  const refresh = () => {
    setPage(1);
    setReload((r) => r + 1);
  };

  const withWeb = suppliers?.filter((s) => s.active && s.connection) ?? [];
  const syncing = supplierId ? withWeb.find((s) => s.id === supplierId) : withWeb.length === 1 ? withWeb[0] : undefined;
  const all = Object.values(data?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className={styles.page}>
      <section className={styles.listPane} aria-label="Pedidos al proveedor">
        <div className={styles.top}>
          <h1 className={styles.title}>Proveedores</h1>
        </div>
        <SuppliersTabs current="pedidos" pending={data?.counts.PENDIENTE} suppliers={suppliers?.length} />

        <Sync
          supplier={syncing}
          many={withWeb.length > 1 && !supplierId}
          none={suppliers !== null && withWeb.length === 0}
          onDone={refresh}
        />

        <div className={styles.filters}>
          {suppliers && suppliers.length > 1 && (
            <label className={styles.select}>
              <span>Proveedor</span>
              <select value={supplierId} onChange={(e) => go({ proveedor: e.target.value || null, pedido: null })}>
                <option value="">Todos</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            type="search"
            className={styles.search}
            aria-label="Buscar pedido"
            placeholder="Buscar por pedido, referencia o producto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className={styles.chips} role="group" aria-label="Estado">
            <button type="button" aria-pressed={!state} onClick={() => go({ estado: null, pedido: null })}>
              Todos <span>{all}</span>
            </button>
            {STATES.map((s) => (
              <button key={s} type="button" aria-pressed={state === s} onClick={() => go({ estado: s, pedido: null })}>
                {STATE_LABEL[s]} <span>{data?.counts[s] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {failed ? (
          <p className={styles.error} role="alert">
            No se han podido cargar los pedidos.{" "}
            <button type="button" className={styles.linkButton} onClick={refresh}>
              Reintentar
            </button>
          </p>
        ) : data === null ? (
          <p className={styles.muted}>Cargando pedidos…</p>
        ) : data.items.length === 0 ? (
          <p className={styles.muted}>
            {all === 0 && !search
              ? "Todavía no hay pedidos. Pulsa «Sincronizar ahora» para leer el historial de su web."
              : "Ningún pedido coincide con la búsqueda."}
          </p>
        ) : (
          <>
            <ul className={styles.list}>
              {data.items.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-current={o.id === open ? "true" : undefined}
                    onClick={() => go({ pedido: o.id })}
                  >
                    <span className={styles.itemHead}>
                      <span className={styles.itemName}>{o.reference}</span>
                      <StateBadge state={o.state} />
                    </span>
                    <span className={styles.sub}>
                      {[shortDate(o.orderDate), money(o.total), o.supplierStatus, !supplierId && (suppliers?.length ?? 0) > 1 && o.supplier.name]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {data.items.length < data.total && (
              <div>
                <Button variant="ghost" size="sm" onClick={() => setPage(page + 1)}>
                  Ver más ({data.total - data.items.length})
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {open && <OrderCard key={open} id={open} onClose={() => go({ pedido: null })} onChanged={() => setReload((r) => r + 1)} />}
    </div>
  );
}

function StateBadge({ state }: { state: OrderState }) {
  const tone = state === "PENDIENTE" ? styles.warn : state === "RECIBIDO" ? styles.ok : styles.off;
  return <span className={tone}>{STATE_LABEL[state]}</span>;
}

interface SyncProps {
  supplier?: SupplierData;
  /** Several suppliers with a website: pick one first. */
  many: boolean;
  /** No supplier has its website connection saved. */
  none: boolean;
  onDone: () => void;
}

/** «Sincronizar ahora»: reads the supplier's website and keeps the new orders. */
function Sync({ supplier, many, none, onDone }: SyncProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const reason = none
    ? "Primero guarda la conexión con su web en Proveedores"
    : many
      ? "Elige primero el proveedor"
      : supplier && !supplier.credentialsUpdatedAt
        ? "Guarda antes sus credenciales en Proveedores"
        : undefined;

  const run = async () => {
    if (!supplier) return;
    setBusy(true);
    setMessage(null);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/suppliers/${supplier.id}/sync`, { method: "POST" });
      if (!res.ok) return setProblem(await errorMessage(res, "No se ha podido sincronizar. No se ha guardado nada."));
      setMessage(syncSummary(await res.json()));
      onDone();
    } catch {
      setProblem("No se ha podido sincronizar. Comprueba la conexión a internet. No se ha guardado nada.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.sync}>
      <div className={styles.syncRow}>
        <Button size="sm" loading={busy} loadingText="Leyendo su web…" disabledReason={reason} onClick={() => void run()}>
          Sincronizar ahora
        </Button>
        {supplier?.ordersSyncedAt && (
          <span className={styles.muted}>Última vez: {formatDay(supplier.ordersSyncedAt)}</span>
        )}
      </div>
      {message && (
        <p className={styles.muted} role="status">
          {message}
        </p>
      )}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

interface CardProps {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}

/** One order with everything the supplier's page says about it. */
function OrderCard({ id, onClose, onChanged }: CardProps) {
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch(`${API_URL}/supplier-orders/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) setOrder((await res.json()) as SupplierOrder);
      })
      .catch(() => live && setProblem("No se ha podido cargar el pedido."));
    return () => {
      live = false;
    };
  }, [id]);

  const act = async (key: string, init: RequestInit, url = `${API_URL}/supplier-orders/${id}`) => {
    setBusy(key);
    setProblem(null);
    try {
      const res = await apiFetch(url, init);
      if (!res.ok) return setProblem(await errorMessage(res, "No se ha podido guardar el cambio."));
      setOrder((await res.json()) as SupplierOrder);
      onChanged();
    } catch {
      setProblem("No se ha podido guardar el cambio. Comprueba la conexión a internet.");
    } finally {
      setBusy(null);
    }
  };
  const setState = (state: OrderState) =>
    act(state, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
  const readLines = () => act("lines", { method: "POST" }, `${API_URL}/supplier-orders/${id}/lines`);

  if (!order) {
    return (
      <aside className={styles.card} aria-label="Pedido">
        {problem ? (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        ) : (
          <p className={styles.muted}>Cargando pedido…</p>
        )}
      </aside>
    );
  }

  const lines = order.lines ?? [];
  const received = order.state === "RECIBIDO";

  return (
    <aside className={styles.card} aria-label={`Pedido ${order.reference}`}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{order.reference}</h2>
        <StateBadge state={order.state} />
        <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
          <X size={18} aria-hidden />
        </button>
      </header>

      <section className={styles.section} aria-label="Datos del pedido">
        <dl className={styles.facts}>
          <dt>Proveedor</dt>
          <dd>{order.supplier.name}</dd>
          <dt>Fecha</dt>
          <dd>{shortDate(order.orderDate)}</dd>
          <dt>Total</dt>
          <dd>{money(order.total)}</dd>
          <dt>Pago</dt>
          <dd>{order.payment ?? "—"}</dd>
          <dt>Estado en su web</dt>
          <dd>{order.supplierStatus ?? "—"}</dd>
          <dt>Guardado en el ERP</dt>
          <dd>{formatDay(order.createdAt)}</dd>
        </dl>
        <div className={styles.syncRow}>
          <a href={order.detailUrl} target="_blank" rel="noreferrer" className={styles.outLink}>
            Ver el pedido en su web <ExternalLink size={14} aria-hidden />
          </a>
          {order.invoiceUrl && (
            <a href={order.invoiceUrl} target="_blank" rel="noreferrer" className={styles.outLink}>
              Factura <ExternalLink size={14} aria-hidden />
            </a>
          )}
        </div>
      </section>

      <section className={styles.section} aria-label="Líneas">
        <h3 className={styles.subTitle}>Líneas</h3>
        {lines.length === 0 ? (
          <p className={styles.muted}>
            Todavía no se han leído sus líneas: es un pedido de antes de conectar el ERP.
          </p>
        ) : (
          <div className={styles.testResult}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Ref.</th>
                  <th>Cant.</th>
                  <th>Precio</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.productUrl ? (
                        <a href={l.productUrl} target="_blank" rel="noreferrer" className={styles.link}>
                          {l.description}
                        </a>
                      ) : (
                        l.description
                      )}
                    </td>
                    <td>{l.ref ?? "—"}</td>
                    <td>{l.quantity}</td>
                    <td>{money(l.unitPrice)}</td>
                    <td>{money(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Suma de las líneas</td>
                  <td>{money(linesTotal(lines).toFixed(2))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!received && (
          <div>
            <Button variant="ghost" size="sm" loading={busy === "lines"} loadingText="Leyendo su web…" onClick={() => void readLines()}>
              {lines.length ? "Volver a leer las líneas" : "Leer las líneas"}
            </Button>
          </div>
        )}
      </section>

      {received && (
        <section className={styles.section} aria-label="Recepción">
          <h3 className={styles.subTitle}>Recibido</h3>
          <p className={styles.muted}>
            {order.receivedAt ? `Comprobado y dado de entrada el ${formatDay(order.receivedAt)}` : "Comprobado y dado de entrada"}
            {order.receivedBy ? ` por ${order.receivedBy.fullName}` : ""}. Su stock ya está en el inventario.
          </p>
        </section>
      )}

      {!received && (
        <section className={styles.section} aria-label="Estado para Kenova">
          <h3 className={styles.subTitle}>Estado para Kenova</h3>
          <p className={styles.muted}>
            {order.state === "PENDIENTE"
              ? "Esperando el paquete. Cuando llegue, pulsa «Revisar y recibir»: compruebas el paquete, das el visto bueno y entonces sube el stock."
              : order.state === "ANTERIOR"
                ? "Ya estaba en su historial cuando se conectó el ERP, así que se da por recibido. Si aún esperas el paquete, márcalo como pendiente."
                : "No se va a recibir (cancelado, devuelto…)."}
          </p>
          <div className={styles.syncRow}>
            {order.state !== "PENDIENTE" && (
              <Button size="sm" loading={busy === "PENDIENTE"} onClick={() => void setState("PENDIENTE")}>
                Marcar pendiente de recibir
              </Button>
            )}
            {order.state === "PENDIENTE" && (
              <>
                {lines.length > 0 && (
                  <Link href={`/inventario?vista=importar&pedidoProveedor=${order.id}`} className={styles.primaryLink}>
                    Revisar y recibir
                  </Link>
                )}
                <Button variant="secondary" size="sm" loading={busy === "DESCARTADO"} onClick={() => void setState("DESCARTADO")}>
                  Descartar
                </Button>
                <Button variant="ghost" size="sm" loading={busy === "ANTERIOR"} onClick={() => void setState("ANTERIOR")}>
                  Ya lo tenía
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
    </aside>
  );
}
