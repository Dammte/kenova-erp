import { STATUS_LABEL, type OrderStatus } from "@/components/ui";

/** GET /api/service-orders/list (design 1.4). */
export type OrderTab = "open" | "all" | OrderStatus;

export interface OrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  priority: "low" | "medium" | "high" | "urgent";
  clientName: string;
  phoneNumber: string | null;
  device: string;
  faults: string[];
  services: string[];
  totalPrice: number;
  balance: number;
  paymentStatus: "pending" | "paid_partial" | "paid" | null;
  createdAt: string;
  /** Days in the shop; for a finished order, days waiting to be collected. */
  days: number | null;
  uncollected: boolean;
  /** Code of the delivered order this one is a warranty claim of. */
  warrantyOf?: string | null;
  /** When the client was last sent a notice about this order. */
  lastNoticeAt?: string | null;
}

/** Quick views of the list (design R3 3.1). */
export type OrderView = "urgent" | "to_notify" | "uncollected" | "debt";
export const VIEWS: { view: OrderView; label: string }[] = [
  { view: "urgent", label: "Urgentes y altas" },
  { view: "to_notify", label: "Listas para avisar" },
  { view: "uncollected", label: "Sin recoger +15 días" },
  { view: "debt", label: "Con saldo" },
];
/** What an empty quick view says. */
export const EMPTY_VIEW: Record<OrderView, string> = {
  urgent: "Ninguna orden urgente ni de prioridad alta",
  to_notify: "No hay órdenes finalizadas sin avisar",
  uncollected: "Ninguna orden lleva más de 15 días sin recoger",
  debt: "Ninguna orden tiene saldo pendiente",
};

export interface OrderListPage {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<OrderTab, number>;
  /** Open orders in each quick view. */
  views?: Record<OrderView, number>;
}

export interface ListQuery {
  tab: OrderTab;
  q: string;
  view: OrderView | null;
  page: number;
}

/** Tabs in the order of the design: "Abiertas" first, "Todas" last. */
export const TABS: { tab: OrderTab; label: string }[] = [
  { tab: "open", label: "Abiertas" },
  { tab: "en_progreso", label: STATUS_LABEL.en_progreso },
  { tab: "pendiente_cliente", label: STATUS_LABEL.pendiente_cliente },
  { tab: "pendiente_piezas", label: STATUS_LABEL.pendiente_piezas },
  { tab: "finalizado", label: "Finalizadas" },
  { tab: "entregado", label: "Entregadas" },
  { tab: "cancelado", label: "Canceladas" },
  { tab: "all", label: "Todas" },
];

/** What each empty tab says, so an empty list explains itself. */
export const EMPTY_TAB: Record<OrderTab, string> = {
  open: "No hay órdenes abiertas",
  en_progreso: "No hay órdenes en progreso",
  pendiente_cliente: "No hay órdenes pendientes del cliente",
  pendiente_piezas: "No hay órdenes pendientes de piezas",
  finalizado: "No hay órdenes finalizadas sin recoger",
  entregado: "No hay órdenes entregadas",
  cancelado: "No hay órdenes canceladas",
  all: "Todavía no hay órdenes",
};

/**
 * What the client reports, as the screens name it. The last three are only
 * on older orders; the intake offers the symptoms (FAULTS in intake.ts).
 */
export const FAULT_LABEL: Record<string, string> = {
  broken_screen: "Pantalla",
  battery: "Batería",
  charging: "No carga",
  not_turning_on: "No enciende",
  liquid_damage: "Mojado",
  signal: "Sin señal / WiFi",
  audio: "Sonido / micrófono",
  camera: "Cámara",
  slow_performance: "Lento / software",
  other: "Otro",
  connectivity: "Conectividad / carga",
  partial: "Funciona parcialmente",
  working: "Funciona bien",
};

export const PRIORITY_LABEL: Record<OrderRow["priority"], string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const PAYMENT_LABEL: Record<NonNullable<OrderRow["paymentStatus"]>, string> = {
  pending: "Pendiente",
  paid_partial: "Pago parcial",
  paid: "Pagado",
};

const TAB_VALUES = new Set<string>(TABS.map((t) => t.tab));
const VIEW_VALUES = new Set<string>(VIEWS.map((v) => v.view));

/** Reads the list state from the address, so going back keeps tab, search and page. */
export function readQuery(params: URLSearchParams): ListQuery {
  const tab = params.get("tab") ?? "open";
  const view = params.get("vista") ?? "";
  const page = Number(params.get("page"));
  return {
    tab: TAB_VALUES.has(tab) ? (tab as OrderTab) : "open",
    q: params.get("q") ?? "",
    // ?debt=true is the older link to «Con saldo».
    view: VIEW_VALUES.has(view) ? (view as OrderView) : params.get("debt") === "true" ? "debt" : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Query string for both the address bar and the API; defaults are left out. */
export function queryString({ tab, q, view, page }: ListQuery, api = false): string {
  const params = new URLSearchParams();
  if (tab !== "open") params.set("tab", tab);
  if (q.trim()) params.set("q", q.trim());
  // The address speaks Spanish; the API keeps its own names.
  if (view) params.set(api ? "view" : "vista", view);
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

/** «Último aviso»: when the client was last told, in words. */
export function noticeAgo(at: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(at).getTime()) / 86_400_000);
  if (days <= 0) return "Avisado hoy";
  return days === 1 ? "Avisado hace 1 día" : `Avisado hace ${days} días`;
}

/** Days in the shop: amber from 7, red from 30, as in design 1.4. */
export const daysLevel = (days: number): "normal" | "warning" | "danger" =>
  days >= 30 ? "danger" : days >= 7 ? "warning" : "normal";
