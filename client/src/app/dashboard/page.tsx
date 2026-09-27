"use client";

import { API_URL, apiFetch } from "@/lib/api";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Calendar,
  Inbox,
  AlertCircle,
  TrendingUp,
  Wrench,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Activity,
  Euro,
  AlertTriangle,
  MapPin,
  Package,
  Users,
  Banknote,
  Receipt,
  ShieldAlert,
  Flame,
  Minus,
  Hourglass,
  BarChart2,
  PieChart as PieIconLucide,
  ChevronDown,
  CheckCheck,
  Smartphone,
} from "lucide-react";
import styles from "./page.module.css";

interface OrderData {
  id?: string;
  status?: string;
  priority?: string;
  totalPrice?: number;
  totalCost?: number;
  total?: number;
  amount?: number;
  amountPaid?: number;   // dinero realmente cobrado
  balance?: number;      // saldo pendiente de cobro
  paymentStatus?: string; // 'paid' | 'paid_partial' | 'pending'
  updatedAt?: string;
  lastUpdate?: string;
  createdAt?: string;
  clientName?: string;
  deviceModel?: string;
  model?: string;
  city?: string;
  clientCity?: string;
  client?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    city?: string;
  };
  device?: { model?: string; type?: string };
}

interface InventoryItem {
  id?: string;
  name?: string;
  partName?: string;
  sku?: string;
  category?: string;
  type?: string;
  partType?: string;
  quantity?: number;
  stock?: number;
  minStock?: number;
  minimumStock?: number;
}

const API_BASE = API_URL;
const IVA_RATE = 0.21;

const MAIN_CITIES = ["Medina de Pomar", "Villarcayo"];

const STATUS = Object.freeze({
  PENDIENTE_CLIENTE: "Pendiente Cliente",
  EN_PROCESO: "En Proceso",
  PEND_PIEZAS: "Pendiente de Piezas",
  // "Finalizado" = reparación terminada, pendiente de recogida
  // "Entregado"  = recogido por el cliente (genera ingreso)
  POR_ENTREGAR: "Finalizado",
  COMPLETADO: "Entregado",
  CANCELADO: "Cancelado",
});

const STATUS_MAP: Record<string, string> = {
  pendiente_cliente: STATUS.PENDIENTE_CLIENTE,
  en_progreso:       STATUS.EN_PROCESO,
  pendiente_piezas:  STATUS.PEND_PIEZAS,
  finalizado:        STATUS.POR_ENTREGAR,   // reparado, aún en taller
  entregado:         STATUS.COMPLETADO,     // devuelto al cliente
  cancelado:         STATUS.CANCELADO,
};

function getStatus(order: OrderData): string {
  if (!order?.status) return STATUS.EN_PROCESO;
  const raw = String(order.status).toLowerCase().trim();
  return STATUS_MAP[raw] ?? STATUS_MAP[order.status] ?? order.status;
}

const PRIORITY_MAP: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};
function getPriority(order: OrderData): string {
  if (!order?.priority) return "Media";
  const key = String(order.priority).toLowerCase();
  return PRIORITY_MAP[key] ?? "Media";
}

const isDelivered = (o: OrderData) => getStatus(o) === STATUS.COMPLETADO;

const isActive = (o: OrderData) => {
  const st = getStatus(o);
  return st !== STATUS.COMPLETADO && st !== STATUS.CANCELADO;
};

const STATUS_CFG = {
  [STATUS.PENDIENTE_CLIENTE]: { color: "#2563eb", bg: "#eff6ff", icon: Users },
  [STATUS.EN_PROCESO]:        { color: "#d97706", bg: "#fffbeb", icon: Activity },
  [STATUS.PEND_PIEZAS]:       { color: "#7c3aed", bg: "#f3effe", icon: Package },
  [STATUS.POR_ENTREGAR]:      { color: "#ea6c0a", bg: "#fff7ed", icon: Inbox },   // Finalizado (en taller, listo)
  [STATUS.COMPLETADO]:        { color: "#059669", bg: "#ecfdf5", icon: CheckCircle2 }, // Entregado al cliente
  [STATUS.CANCELADO]:         { color: "#dc2626", bg: "#fef2f2", icon: AlertCircle },
};

const PRIORITY_CFG = {
  Urgente: {
    color: "#b91c1c",
    bg: "#fef2f2",
    lightBg: "#fff0f0",
    icon: AlertCircle,
  },
  Alta: { color: "#dc2626", bg: "#fef2f2", lightBg: "#fff5f5", icon: Flame },
  Media: {
    color: "#d97706",
    bg: "#fffbeb",
    lightBg: "#fffdf0",
    icon: ShieldAlert,
  },
  Baja: { color: "#2563eb", bg: "#eff6ff", lightBg: "#f5f8ff", icon: Minus },
};

const CITY_ALIASES: Record<string, string> = {
  medina: "Medina de Pomar",
  "medina de pomar": "Medina de Pomar",
  "medina del pomar": "Medina de Pomar",
  "medina pomar": "Medina de Pomar",
  villarcayo: "Villarcayo",
  villaracayo: "Villarcayo",
  "villarcayo de merindad de castilla la vieja": "Villarcayo",
  "espinosa de los monteros": "Espinosa de los Monteros",
  "espinosa los monteros": "Espinosa de los Monteros",
  trespaderne: "Trespaderne",
  getxo: "Getxo",
  guecho: "Getxo",
  palencia: "Palencia",
};

function normalizeCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t || t.length < 3 || /^\d+$/.test(t)) return null;
  const key = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];
  return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function apiFetch(endpoint: string): Promise<unknown> {
  try {
    const res = await apiFetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${endpoint}`);
    return await res.json();
  } catch (err) {
    console.error(`[API ✗] ${endpoint}:`, (err as Error).message);
    return null;
  }
}

function extractArray(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  for (const key of ["data", "items", "results", "orders", "records"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  const found = Object.values(obj).find(Array.isArray);
  return (found as unknown[]) ?? [];
}

const getClientName = (o: OrderData): string | null => {
  const c = o?.client;
  if (c?.firstName)
    return `${c.firstName.trim()} ${(c.lastName ?? "").trim()}`.trim();
  if (c?.name) return String(c.name).trim();
  if (typeof c === "string" && (c as string).length > 0) return c as string;
  return o?.clientName ?? null;
};

const getDeviceModel = (o: OrderData): string | null => {
  const d = o?.device;
  if (d?.model) return String(d.model).trim();
  if (d?.type) return String(d.type).trim();
  return o?.deviceModel ?? o?.model ?? null;
};

const getCity = (o: OrderData): string | null =>
  normalizeCity(o?.client?.city ?? o?.city ?? o?.clientCity ?? null);

// Importe total facturado (presupuesto acordado)
const getAmountFacturado = (o: OrderData): number =>
  Number(o?.totalPrice ?? o?.totalCost ?? o?.total ?? o?.amount ?? 0) || 0;

// Dinero realmente cobrado: usa amountPaid si existe, o totalPrice como fallback
// para órdenes antiguas que no tienen registro de pago
const getAmountCobrado = (o: OrderData): number => {
  if (o?.amountPaid != null) return Number(o.amountPaid) || 0;
  // Fallback legacy: si paymentStatus es 'paid', asumir totalPrice cobrado
  if (o?.paymentStatus === "paid") return getAmountFacturado(o);
  // Sin datos de pago → usar totalPrice como estimación conservadora
  return getAmountFacturado(o);
};

const getUpdatedAt = (o: OrderData): Date => {
  const d = new Date(o?.updatedAt ?? o?.lastUpdate ?? o?.createdAt ?? 0);
  return isNaN(d.getTime()) ? new Date(0) : d;
};

const getInitials = (name: string | null | undefined): string => {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();
};

const fEur = (v: number): string =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(v ?? 0);

const fNum = (v: number | null | undefined): string =>
  v == null ? "—" : String(v);

const calcIva = (b: number): number => (b * IVA_RATE) / (1 + IVA_RATE);
const calcNeto = (b: number): number => b - calcIva(b);

interface TooltipPayloadItem { name?: string; value?: number; color?: string; stroke?: string; }
const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.ttLabel}>{label}</p>
      {payload.map((p: TooltipPayloadItem, i: number) => (
        <p key={i} style={{ color: p.color ?? p.stroke }}>
          {p.name}: <strong>{fEur(p.value ?? 0)}</strong>
        </p>
      ))}
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  bg: string;
  trend?: number;
  trendUp?: boolean;
  mono?: boolean;
}
const StatCard = ({ title, value, sub, icon: Icon, color, bg, trend, trendUp, mono }: StatCardProps) => (
  <div className={styles.statCard} style={{ "--c": color } as React.CSSProperties}>
    <div className={styles.scTop}>
      <span className={styles.scTitle}>{title}</span>
      <div className={styles.scIcon} style={{ background: bg }}>
        <Icon size={14} color={color} />
      </div>
    </div>
    <div className={`${styles.scValue} ${mono ? styles.scMono : ""}`}>
      {value}
    </div>
    {sub && <div className={styles.scSub}>{sub}</div>}
    {trend != null && (
      <div
        className={`${styles.scTrend} ${trendUp ? styles.tUp : styles.tDown}`}
      >
        {trendUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
        <span>{trend}% vs. mes anterior</span>
      </div>
    )}
  </div>
);

interface CityOption { value: string; label: string; count?: number; }
const CityDropdown = ({ options, value, onChange }: { options: CityOption[]; value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const selected = options.find((o: CityOption) => o.value === value);

  return (
    <div className={styles.cityDropWrap} ref={ref}>
      <button
        className={`${styles.cityDropBtn} ${open ? styles.cityDropOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <MapPin size={13} />
        <span className={styles.cityDropLabel}>
          {selected?.label ?? "Todas las ciudades"}
        </span>
        {value !== "all" && selected?.count != null && (
          <span className={styles.cityDropCount}>{selected.count}</span>
        )}
        <ChevronDown
          size={13}
          className={`${styles.cityChev} ${open ? styles.cityChevOpen : ""}`}
        />
      </button>

      {open && (
        <div className={styles.cityDropMenu}>
          <div className={styles.cityDropHeader}>
            <MapPin size={11} />
            <span className={styles.cityDropMenuTitle}>Filtrar por ciudad</span>
          </div>
          <div className={styles.cityDropList}>
            {options.map((opt: CityOption) => (
              <button
                key={opt.value}
                className={`${styles.cityDropItem} ${value === opt.value ? styles.cityDropItemActive : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className={styles.cityDropItemName}>{opt.label}</span>
                {opt.count != null && (
                  <span className={styles.cityDropItemCount}>{opt.count}</span>
                )}
                {value === opt.value && (
                  <CheckCheck size={12} className={styles.cityDropCheck} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const InvTypeDropdown = ({ types, value, onChange, counts }: { types: string[]; value: string; onChange: (v: string) => void; counts: Record<string, number> }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const label = value === "all" ? "Todos" : value;

  return (
    <div className={styles.invDropWrap} ref={ref}>
      <button
        className={`${styles.invDropBtn} ${open ? styles.invDropOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Package size={12} />
        <span>{label}</span>
        {value !== "all" && counts[value] != null && (
          <span className={styles.invDropCount}>{counts[value]}</span>
        )}
        <ChevronDown
          size={11}
          className={`${styles.cityChev} ${open ? styles.cityChevOpen : ""}`}
        />
      </button>

      {open && (
        <div className={styles.invDropMenu}>
          <div className={styles.invDropList}>
            {types.map((t: string) => (
              <button
                key={t}
                className={`${styles.invDropItem} ${value === t ? styles.invDropItemActive : ""}`}
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
              >
                <span className={styles.invDropItemName}>
                  {t === "all" ? "Todos los tipos" : t}
                </span>
                {counts[t] != null && (
                  <span className={styles.invDropItemCount}>{counts[t]}</span>
                )}
                {value === t && (
                  <CheckCheck size={11} className={styles.cityDropCheck} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface StatusDataItem { name: string; color: string; value: number; }
const StatusWidget = ({ data }: { data: StatusDataItem[] }) => {
  const [view, setView] = useState("bars");
  const total = data.reduce((s: number, d: StatusDataItem) => s + d.value, 0);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          <PieIconLucide size={14} />
          Estado de Órdenes
        </h3>
        <div className={styles.statusViewToggle}>
          {total > 0 && <span className={styles.badge}>{total}</span>}
          <button
            title="Vista de barras"
            className={`${styles.viewBtn} ${view === "bars" ? styles.viewBtnActive : ""}`}
            onClick={() => setView("bars")}
          >
            <BarChart2 size={14} />
          </button>
          <button
            title="Vista circular"
            className={`${styles.viewBtn} ${view === "pie" ? styles.viewBtnActive : ""}`}
            onClick={() => setView("pie")}
          >
            <PieIconLucide size={14} />
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <Empty msg="Sin órdenes activas" />
      ) : view === "bars" ? (
        <div className={styles.statusRows}>
          {data.map((d: StatusDataItem, i: number) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <div key={i} className={styles.statusRow}>
                <div className={styles.statusRowTop}>
                  <div className={styles.statusRowLeft}>
                    <span
                      className={styles.statusDot}
                      style={{ background: d.color }}
                    />
                    <span className={styles.statusRowName}>{d.name}</span>
                  </div>
                  <div className={styles.statusRowRight}>
                    <span
                      className={styles.statusRowPct}
                      style={{ color: d.color }}
                    >
                      {pct.toFixed(0)}%
                    </span>
                    <span className={styles.statusRowVal}>{d.value}</span>
                  </div>
                </div>
                <div className={styles.statusBarWrap}>
                  <div
                    className={styles.statusBar}
                    style={{ width: `${pct}%`, background: d.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.pieWrap}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={80}
                dataKey="value"
                paddingAngle={3}
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((e: StatusDataItem, i: number) => (
                  <Cell key={i} fill={e.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [value, name]}
                contentStyle={{
                  background: "#fff",
                  border: "1px solid rgba(99,120,160,0.2)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className={styles.pieLegend}>
            {data.map((d: StatusDataItem, i: number) => (
              <div key={i} className={styles.pieLegendItem}>
                <span
                  className={styles.pieLegendDot}
                  style={{ background: d.color }}
                />
                <span className={styles.pieLegendName}>{d.name}</span>
                <span className={styles.pieLegendVal}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

type PrioritiesMap = Record<string, OrderData[]>;
const PrioritySection = ({ priorities }: { priorities: PrioritiesMap }) => {
  const totalActive = Object.values(priorities).reduce(
    (s: number, a: OrderData[]) => s + a.length,
    0,
  );

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          <ShieldAlert size={14} />
          Órdenes por Prioridad
        </h3>
        <span className={styles.badge}>{totalActive} activas</span>
      </div>

      {totalActive === 0 ? (
        <Empty msg="Sin órdenes activas en este momento" good />
      ) : (
        <div className={styles.prioColumns}>
          {Object.entries(PRIORITY_CFG).map(([label, cfg]) => {
            const list = priorities[label] ?? [];
            return (
              <div
                key={label}
                className={styles.prioCol}
                style={{
                  "--pc": cfg.color,
                  "--pb": cfg.bg,
                  "--plb": cfg.lightBg,
                } as React.CSSProperties}
              >
                {/* Cabecera de columna */}
                <div className={styles.prioColHead}>
                  <div className={styles.prioColHeadLeft}>
                    <div className={styles.prioColIcon}>
                      <cfg.icon size={13} color={cfg.color} />
                    </div>
                    <span className={styles.prioColLabel}>{label}</span>
                  </div>
                  <span
                    className={styles.prioColBadge}
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {list.length}
                  </span>
                </div>

                <div className={styles.prioColBody}>
                  {list.length === 0 ? (
                    <div className={styles.prioEmpty}>
                      <CheckCircle2 size={18} color="#c4cfe0" />
                      <span>Sin órdenes</span>
                    </div>
                  ) : (
                    <>
                      {list.slice(0, 4).map((o: OrderData, i: number) => {
                        const name = getClientName(o);
                        const device = getDeviceModel(o);
                        const st = getStatus(o);
                        const stCfg = (STATUS_CFG as Record<string, { color: string; bg: string; icon: React.ComponentType }>)[st] ?? {
                          color: "#64748b",
                          bg: "#f1f5f9",
                        };
                        return (
                          <div key={o.id ?? i} className={styles.prioItem}>
                            <div
                              className={styles.prioAvatar}
                              style={{ background: cfg.bg, color: cfg.color }}
                            >
                              {getInitials(name)}
                            </div>
                            <div className={styles.prioMeta}>
                              <span className={styles.prioClient}>
                                {name ?? "—"}
                              </span>
                              <span className={styles.prioDevice}>
                                <Smartphone size={10} />
                                {device ?? "—"}
                              </span>
                            </div>
                            <span
                              className={styles.prioStatusPill}
                              style={{
                                background: stCfg.bg,
                                color: stCfg.color,
                              }}
                            >
                              {st}
                            </span>
                          </div>
                        );
                      })}
                      {list.length > 4 && (
                        <div className={styles.prioMore}>
                          +{list.length - 4} más
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StaleOrdersTable = ({ orders }: { orders: OrderData[] }) => {
  if (orders.length === 0)
    return <Empty msg="¡Todo al día! Sin órdenes estancadas" good />;

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Dispositivo</th>
            <th>Ciudad</th>
            <th>Estado</th>
            <th>Sin act.</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o: OrderData, i: number) => {
            const st = getStatus(o);
            const cfg = (STATUS_CFG as Record<string, { color: string; bg: string }>)[st] ?? { color: "#64748b", bg: "#f1f5f9" };
            const city = getCity(o);
            const days = Math.floor(
              (Date.now() - getUpdatedAt(o).getTime()) / 86_400_000,
            );
            return (
              <tr key={o.id ?? i} className={styles.tRow}>
                <td className={styles.tClientCell}>
                  <div className={styles.tClientAvatar}>
                    {getInitials(getClientName(o))}
                  </div>
                  {getClientName(o) ?? <span className={styles.na}>—</span>}
                </td>
                <td>
                  {getDeviceModel(o) ?? <span className={styles.na}>—</span>}
                </td>
                <td>
                  {city ? (
                    <span
                      className={`${styles.cityChip} ${MAIN_CITIES.includes(city) ? styles.cityChipMain : ""}`}
                    >
                      {city}
                    </span>
                  ) : (
                    <span className={styles.na}>—</span>
                  )}
                </td>
                <td>
                  <span
                    className={styles.sBadge}
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {st}
                  </span>
                </td>
                <td>
                  <span
                    className={`${styles.daysBadge} ${days > 14 ? styles.daysHigh : styles.daysMed}`}
                  >
                    {days}d
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default function Dashboard() {
  // State
  const [orders, setOrders] = useState<OrderData[] | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros
  const [cityFilter, setCityFilter] = useState("all");
  const [revPeriod, setRevPeriod] = useState("month");
  const [revDateFrom, setRevDateFrom] = useState("");
  const [revDateTo, setRevDateTo] = useState("");

  // Gráfica
  const [showBruto, setShowBruto] = useState(true);
  const [showNeto, setShowNeto] = useState(true);
  const [showIva, setShowIva] = useState(false);

  // Filtro de tipo de repuesto
  const [invTypeFilter, setInvTypeFilter] = useState("all");

  // Fetch de datos
  const loadData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const [oRaw, iRaw] = await Promise.all([
      apiFetch("/service-orders"),
      apiFetch("/inventory"),
    ]);

    if (oRaw === null && iRaw === null) {
      setError("No se pudo conectar con el servidor. Verifica tu conexión.");
    }

    setOrders(extractArray(oRaw) as OrderData[]);
    setInventory(extractArray(iRaw) as InventoryItem[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cityOptions = useMemo(() => {
    const countMap: Record<string, number> = {};
    (orders ?? []).forEach((o) => {
      const c = getCity(o);
      if (c) countMap[c] = (countMap[c] ?? 0) + 1;
    });
    MAIN_CITIES.forEach((c) => {
      if (!(c in countMap)) countMap[c] = 0;
    });

    const sorted = Object.keys(countMap).sort((a, b) => {
      const aM = MAIN_CITIES.includes(a);
      const bM = MAIN_CITIES.includes(b);
      if (aM && !bM) return -1;
      if (!aM && bM) return 1;
      return a.localeCompare(b, "es");
    });

    return [
      {
        value: "all",
        label: "Todas las ciudades",
        count: (orders ?? []).length,
      },
      ...sorted.map((c) => ({ value: c, label: c, count: countMap[c] })),
    ];
  }, [orders]);

  const filtered = useMemo(() => {
    const all = orders ?? [];
    if (cityFilter === "all") return all;
    return all.filter((o) => getCity(o) === cityFilter);
  }, [orders, cityFilter]);

  const deliveredOrders = useMemo(() => {
    const base = filtered.filter(isDelivered);
    if (!revDateFrom && !revDateTo) return base;
    const from = revDateFrom ? new Date(revDateFrom) : new Date(0);
    const to = revDateTo ? new Date(revDateTo) : new Date();
    to.setHours(23, 59, 59, 999);
    return base.filter((o) => {
      const d = getUpdatedAt(o);
      return d >= from && d <= to;
    });
  }, [filtered, revDateFrom, revDateTo]);

  const kpis = useMemo(() => {
    if (orders === null) return null;

    const byStatus = (s: string): number => filtered.filter((o) => getStatus(o) === s).length;

    // Dinero realmente cobrado en el periodo (amountPaid de órdenes entregadas)
    const cobrado = deliveredOrders.reduce((s, o) => s + getAmountCobrado(o), 0);
    // Total facturado en el periodo (lo que se presupuestó/facturó)
    const facturado = deliveredOrders.reduce((s, o) => s + getAmountFacturado(o), 0);
    // Saldo pendiente de cobro en el periodo (solo órdenes con amountPaid registrado)
    const pendienteCobro = deliveredOrders.reduce((s, o) => {
      if (o.amountPaid == null) return s; // sin registro de pago → no contar
      return s + Math.max(0, getAmountFacturado(o) - Number(o.amountPaid));
    }, 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // Usa `filtered` (respeta el filtro de ciudad activo)
    const hoy = filtered.filter((o) => {
      const d = new Date(o.createdAt ?? 0);
      return d >= todayStart;
    }).length;

    const ayer = filtered.filter((o) => {
      const d = new Date(o.createdAt ?? 0);
      return d >= yesterdayStart && d < todayStart;
    }).length;

    return {
      // ── Financiero ──────────────────────────────────────────────
      cobrado,                    // amountPaid sumado (dinero real en caja)
      facturado,                  // totalPrice sumado (lo presupuestado/facturado)
      pendienteCobro,             // facturado - cobrado (saldo por cobrar)
      iva: calcIva(cobrado),      // IVA extraído del cobrado
      neto: calcNeto(cobrado),    // Cobrado sin IVA
      // ── Contadores de órdenes ───────────────────────────────────
      facturadas: deliveredOrders.length,               // entregadas en el periodo (con filtro fecha)
      completadasTotal: filtered.filter(isDelivered).length, // histórico entregadas (solo ciudad)
      totalFiltered: filtered.length,
      // ── Por estado (operativo) ──────────────────────────────────
      completadas: byStatus(STATUS.COMPLETADO),
      enProceso: byStatus(STATUS.EN_PROCESO),
      porEntregar: byStatus(STATUS.POR_ENTREGAR),
      pendPiezas: byStatus(STATUS.PEND_PIEZAS),
      pendienteCliente: byStatus(STATUS.PENDIENTE_CLIENTE),
      totalActivas: filtered.filter(isActive).length,
      // ── Actividad diaria ────────────────────────────────────────
      hoy,
      ayer,
    };
  }, [filtered, deliveredOrders, orders]);

  // Datos para widget de estado
  const statusData = useMemo(
    () =>
      Object.entries(STATUS_CFG)
        .filter(([k]) => k !== STATUS.CANCELADO)
        .map(([name, cfg]) => ({
          name,
          color: cfg.color,
          value: filtered.filter((o) => getStatus(o) === name).length,
        }))
        .filter((d) => d.value > 0),
    [filtered],
  );

  // Datos para gráfica de ingresos
  const revenueChart = useMemo(
    () => buildRevenueChart(deliveredOrders, revPeriod),
    [deliveredOrders, revPeriod],
  );
  const hasRevData = revenueChart.some((d) => d.bruto > 0);

  // Prioridades
  const priorities = useMemo(() => {
    const active = filtered.filter(isActive);
    return {
      Urgente: active.filter((o) => getPriority(o) === "Urgente"),
      Alta: active.filter((o) => getPriority(o) === "Alta"),
      Media: active.filter((o) => getPriority(o) === "Media"),
      Baja: active.filter((o) => getPriority(o) === "Baja"),
    };
  }, [filtered]);

  // Órdenes sin actividad
  const staleOrders = useMemo(() => {
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    return filtered
      .filter((o) => isActive(o) && getUpdatedAt(o) < cutoff)
      .sort((a, b) => getUpdatedAt(a).getTime() - getUpdatedAt(b).getTime())
      .slice(0, 12);
  }, [filtered]);

  // Tipos de repuesto para el dropdown de inventario
  const invTypes = useMemo(() => {
    const types = new Set(
      (inventory ?? [])
        .map((i) => i.category ?? i.type ?? i.partType ?? null)
        .filter((x): x is string => x !== null),
    );
    return [
      "all",
      ...Array.from(types).sort((a, b) => a.localeCompare(b, "es")),
    ];
  }, [inventory]);

  // Stock bajo
  const allLowStock = useMemo(
    () =>
      (inventory ?? []).filter(
        (i) =>
          Number(i.quantity ?? i.stock ?? 0) <=
          (i.minStock ?? i.minimumStock ?? 5),
      ),
    [inventory],
  );

  const lowStock = useMemo(() => {
    if (invTypeFilter === "all") return allLowStock;
    return allLowStock.filter(
      (i) => (i.category ?? i.type ?? i.partType ?? null) === invTypeFilter,
    );
  }, [allLowStock, invTypeFilter]);

  if (loading) return <LoadingScreen />;

  return (
    <div className={styles.root}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      {/* ── HEADER ───────*/}
      <header className={styles.header}>
        <div className={styles.hLeft}>
          <div className={styles.hDate}>
            <Calendar size={13} />
            <span>
              {new Date().toLocaleDateString("es-ES", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
        <div className={styles.hRight}>
          <CityDropdown
            options={cityOptions}
            value={cityFilter}
            onChange={setCityFilter}
          />
          {allLowStock.length > 0 && (
            <div
              className={styles.alertBadge}
              title={`${allLowStock.length} artículo(s) con stock bajo`}
            >
              <AlertTriangle size={13} />
              <span>{allLowStock.length} stock bajo</span>
            </div>
          )}
          <button
            className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ""}`}
            onClick={loadData}
            title="Actualizar datos"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {error && (
          <div className={styles.errorBanner}>
            <AlertTriangle size={13} />
            <span>{error}</span>
            <button className={styles.cityBannerClear} onClick={loadData}>
              Reintentar ↺
            </button>
          </div>
        )}

        {cityFilter !== "all" && (
          <div className={styles.cityBanner}>
            <MapPin size={13} />
            <span>
              Datos de <strong>{cityFilter}</strong>
            </span>
            <button
              className={styles.cityBannerClear}
              onClick={() => setCityFilter("all")}
            >
              Quitar filtro ✕
            </button>
          </div>
        )}

        {/* ── FINANZAS ─────── */}
        <section className={styles.financeSection}>
          <div className={styles.financeTitleRow}>
            <div className={styles.sectionTitle}>
              <Euro size={14} />
              <span>Resumen Financiero</span>
            </div>
            <div className={styles.dateRow}>
              <label className={styles.dateLabel}>Desde</label>
              <input
                type="date"
                className={styles.dateInput}
                value={revDateFrom}
                onChange={(e) => setRevDateFrom(e.target.value)}
              />
              <label className={styles.dateLabel}>Hasta</label>
              <input
                type="date"
                className={styles.dateInput}
                value={revDateTo}
                onChange={(e) => setRevDateTo(e.target.value)}
              />
              {(revDateFrom || revDateTo) && (
                <button
                  className={styles.clearDate}
                  onClick={() => {
                    setRevDateFrom("");
                    setRevDateTo("");
                  }}
                >
                  Limpiar ✕
                </button>
              )}
            </div>
          </div>
          <div className={styles.financeGrid}>
            {/* Cobrado: dinero real en caja (amountPaid) */}
            <StatCard
              title="Cobrado"
              value={kpis ? fEur(kpis.cobrado) : "—"}
              sub={
                kpis && kpis.facturado !== kpis.cobrado
                  ? `Facturado: ${fEur(kpis.facturado)}`
                  : kpis
                  ? `${kpis.facturadas} órdenes entregadas`
                  : undefined
              }
              icon={Banknote}
              color="#059669"
              bg="#ecfdf5"
              mono
            />
            {/* IVA extraído del cobrado */}
            <StatCard
              title="IVA (21%)"
              value={kpis ? fEur(kpis.iva) : "—"}
              sub={kpis ? `Neto: ${fEur(kpis.neto)}` : undefined}
              icon={Receipt}
              color="#7c3aed"
              bg="#f3effe"
              mono
            />
            {/* Neto cobrado (sin IVA) */}
            <StatCard
              title="Neto Cobrado"
              value={kpis ? fEur(kpis.neto) : "—"}
              sub="Sin IVA"
              icon={Euro}
              color="#4f6ef7"
              bg="#eef1fe"
              mono
            />
            {/* Pendiente de cobro: órdenes entregadas con saldo sin pagar */}
            <StatCard
              title="Pendiente de Cobro"
              value={kpis ? fEur(kpis.pendienteCobro) : "—"}
              sub={
                kpis
                  ? kpis.pendienteCobro > 0
                    ? `${kpis.facturadas} entregadas · saldo sin cobrar`
                    : `${kpis.completadasTotal} entregadas · todo cobrado`
                  : undefined
              }
              icon={AlertCircle}
              color={kpis && kpis.pendienteCobro > 0 ? "#d97706" : "#059669"}
              bg={kpis && kpis.pendienteCobro > 0 ? "#fffbeb" : "#ecfdf5"}
              mono
            />
          </div>
        </section>

        {/* ── KPIs OPERATIVOS ──── */}
        <section className={styles.kpiGrid}>
          <StatCard
            title="Finalizadas"
            value={kpis ? fNum(kpis.porEntregar) : "—"}
            icon={CheckCircle2}
            color="#ea6c0a"
            bg="#fff7ed"
            sub="Reparadas · pendientes de recogida"
          />
          <StatCard
            title="Pend. de Piezas"
            value={kpis ? fNum(kpis.pendPiezas) : "—"}
            icon={Package}
            color="#7c3aed"
            bg="#f3effe"
            sub="En espera de repuestos"
          />
          <StatCard
            title="En Proceso"
            value={kpis ? fNum(kpis.enProceso) : "—"}
            icon={Activity}
            color="#d97706"
            bg="#fffbeb"
            sub="Reparacion en curso"
          />
          <StatCard
            title="Pendiente Cliente"
            value={kpis ? fNum(kpis.pendienteCliente) : "—"}
            icon={Users}
            color="#2563eb"
            bg="#eff6ff"
            sub="Esperando respuesta del cliente"
          />
          <StatCard
            title="Total Activas"
            value={kpis ? fNum(kpis.totalActivas) : "—"}
            icon={Wrench}
            color="#0891b2"
            bg="#ecfeff"
            sub="En proceso o pendientes"
          />
          <StatCard
            title="Recibidas Hoy"
            value={kpis ? fNum(kpis.hoy) : "—"}
            icon={Calendar}
            color="#059669"
            bg="#ecfdf5"
            sub={kpis ? (kpis.ayer > 0 ? `${kpis.ayer} ayer` : "sin órdenes ayer") : undefined}
            trend={kpis && kpis.ayer > 0 ? Math.round(((kpis.hoy - kpis.ayer) / kpis.ayer) * 100) : undefined}
            trendUp={kpis ? kpis.hoy >= kpis.ayer : undefined}
          />
        </section>

        {/* ── GRÁFICAS ─── */}
        <section className={styles.chartsRow}>
          <StatusWidget data={statusData} />

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <TrendingUp size={14} />
                Evolución de Ingresos
              </h3>
              <div className={styles.chartControls}>
                <div className={styles.lineToggles}>
                  {(
                    [
                      [showBruto, setShowBruto, "#4f6ef7", "Bruto"],
                      [showNeto, setShowNeto, "#059669", "Neto"],
                      [showIva, setShowIva, "#7c3aed", "IVA"],
                    ] as [boolean, React.Dispatch<React.SetStateAction<boolean>>, string, string][]
                  ).map(([active, set, color, label], i) => (
                    <button
                      key={i}
                      className={`${styles.lineToggle} ${active ? styles.ltActive : ""}`}
                      style={{ "--lc": color } as React.CSSProperties}
                      onClick={() => set((v) => !v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className={styles.timeToggle}>
                  {[
                    ["day", "Hoy"],
                    ["week", "Semana"],
                    ["month", "Mes"],
                    ["year", "Año"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={`${styles.tBtn} ${revPeriod === v ? styles.tActive : ""}`}
                      onClick={() => setRevPeriod(v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {!hasRevData ? (
              <Empty msg="Sin ingresos registrados en el periodo seleccionado" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart
                  data={revenueChart}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    {[
                      ["gBruto", "#4f6ef7"],
                      ["gNeto", "#059669"],
                      ["gIva", "#7c3aed"],
                    ].map(([id, c]) => (
                      <linearGradient
                        key={id}
                        id={id}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={c} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(99,120,160,0.09)"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#7e93b3", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k€` : `${v}€`
                    }
                    tick={{ fill: "#7e93b3", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {showBruto && (
                    <Area
                      type="monotone"
                      dataKey="bruto"
                      name="Bruto"
                      stroke="#4f6ef7"
                      strokeWidth={2}
                      fill="url(#gBruto)"
                      dot={{ fill: "#4f6ef7", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {showNeto && (
                    <Area
                      type="monotone"
                      dataKey="neto"
                      name="Neto"
                      stroke="#059669"
                      strokeWidth={2}
                      fill="url(#gNeto)"
                      dot={{ fill: "#059669", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {showIva && (
                    <Area
                      type="monotone"
                      dataKey="iva"
                      name="IVA"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="url(#gIva)"
                      dot={{ fill: "#7c3aed", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ── PRIORIDADES ────── */}
        <PrioritySection priorities={priorities} />

        {/* ── ÓRDENES ESTANCADAS ── */}
        <section className={styles.bottomRow}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <Hourglass size={14} />
                Órdenes Sin Actividad › 7 días
              </h3>
              {staleOrders.length > 0 && (
                <span className={styles.badgeWarn}>
                  {staleOrders.length} órdenes
                </span>
              )}
            </div>
            <StaleOrdersTable orders={staleOrders} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <AlertTriangle size={14} />
                Stock Bajo
              </h3>
              <div className={styles.invHeaderRight}>
                {invTypes.length > 1 && (
                  <InvTypeDropdown
                    types={invTypes}
                    value={invTypeFilter}
                    onChange={setInvTypeFilter}
                    counts={invTypes.reduce(
                      (acc: Record<string, number>, t) => {
                        acc[t] =
                          t === "all"
                            ? allLowStock.length
                            : allLowStock.filter(
                                (i) =>
                                  (i.category ??
                                    i.type ??
                                    i.partType ??
                                    null) === t,
                              ).length;
                        return acc;
                      },
                      {},
                    )}
                  />
                )}
                {lowStock.length > 0 && (
                  <span className={styles.badgeWarn}>{lowStock.length}</span>
                )}
              </div>
            </div>
            {inventory === null ? (
              <Empty msg="Conectando con el servidor…" />
            ) : lowStock.length === 0 ? (
              <Empty
                msg={
                  allLowStock.length > 0 && invTypeFilter !== "all"
                    ? `Sin alertas en "${invTypeFilter}"`
                    : "Inventario en niveles normales ✓"
                }
                good
              />
            ) : (
              <div className={styles.invList}>
                {lowStock.slice(0, 10).map((item, i) => {
                  const qty = Number(item.quantity ?? item.stock ?? 0);
                  const min = item.minStock ?? item.minimumStock ?? 5;
                  const pct = Math.min((qty / Math.max(min, 1)) * 100, 100);
                  return (
                    <div key={item.id ?? i} className={styles.invRow}>
                      <div className={styles.invInfo}>
                        <span className={styles.invName}>
                          {item.name ?? item.partName ?? "—"}
                        </span>
                        <div className={styles.invMeta}>
                          {item.sku && (
                            <span className={styles.invSku}>{item.sku}</span>
                          )}
                          {(item.category ?? item.type ?? item.partType) && (
                            <span className={styles.invType}>
                              {item.category ?? item.type ?? item.partType}
                            </span>
                          )}
                        </div>
                        <div className={styles.invBarWrap}>
                          <div
                            className={styles.invBar}
                            style={{
                              width: `${pct}%`,
                              background:
                                pct < 30
                                  ? "#dc2626"
                                  : pct < 60
                                    ? "#d97706"
                                    : "#059669",
                            }}
                          />
                        </div>
                      </div>
                      <div className={styles.invQty}>
                        <span
                          className={styles.invQtyN}
                          style={{ color: qty === 0 ? "#dc2626" : "#d97706" }}
                        >
                          {qty}
                        </span>
                        <span className={styles.invQtyL}>uds.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

interface RevenuePoint { name: string; bruto: number; neto: number; iva: number; }

function buildRevenueChart(orders: OrderData[], period: string): RevenuePoint[] {
  const add = (map: Record<string, number>, key: string, val: number): void => {
    if (key in map) map[key] += val;
  };

  if (period === "day") {
    const map: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      map[d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })] = 0;
    }
    orders.forEach((o) =>
      add(
        map,
        getUpdatedAt(o).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
        getAmountCobrado(o),
      ),
    );
    return Object.entries(map).map(([name, b]) => ({
      name,
      bruto: b,
      neto: calcNeto(b),
      iva: calcIva(b),
    }));
  }

  if (period === "week") {
    const map: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      map[`S${getISOWeek(d)}`] = 0;
    }
    orders.forEach((o) =>
      add(map, `S${getISOWeek(getUpdatedAt(o))}`, getAmountCobrado(o)),
    );
    return Object.entries(map).map(([name, b]) => ({
      name,
      bruto: b,
      neto: calcNeto(b),
      iva: calcIva(b),
    }));
  }

  if (period === "month") {
    const M = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const map: Record<string, number> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      map[`${M[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`] = 0;
    }
    orders.forEach((o) => {
      const d = getUpdatedAt(o);
      add(
        map,
        `${M[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        getAmountCobrado(o),
      );
    });
    return Object.entries(map).map(([name, b]) => ({
      name,
      bruto: b,
      neto: calcNeto(b),
      iva: calcIva(b),
    }));
  }

  const map: Record<string, number> = {};
  const y = new Date().getFullYear();
  for (let i = 4; i >= 0; i--) map[String(y - i)] = 0;
  orders.forEach((o) =>
    add(map, String(getUpdatedAt(o).getFullYear()), getAmountCobrado(o)),
  );
  return Object.entries(map).map(([name, b]) => ({
    name,
    bruto: b,
    neto: calcNeto(b),
    iva: calcIva(b),
  }));
}

function getISOWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y.getTime()) / 86_400_000 + 1) / 7);
}

const LoadingScreen = () => (
  <div className={styles.loadingScreen}>
    <div className={styles.spinner} />
    <p>Cargando panel de control…</p>
  </div>
);

const Empty = ({ msg, good }: { msg: string; good?: boolean }) => (
  <div className={styles.empty}>
    {good ? (
      <CheckCircle2 size={24} color="#059669" />
    ) : (
      <Package size={24} color="#c4cfe0" />
    )}
    <span>{msg}</span>
  </div>
);
