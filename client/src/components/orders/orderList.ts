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
}

export interface OrderListPage {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<OrderTab, number>;
}

export interface ListQuery {
  tab: OrderTab;
  q: string;
  debt: boolean;
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

/** The intake chips, as the client reports them. */
export const FAULT_LABEL: Record<string, string> = {
  broken_screen: "Pantalla rota",
  battery: "Batería",
  not_turning_on: "No enciende",
  liquid_damage: "Daño por líquido",
  connectivity: "Conectividad / carga",
  slow_performance: "Lento",
  partial: "Funciona parcialmente",
  working: "Funciona bien",
  other: "Otro",
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

/** Reads the list state from the address, so going back keeps tab, search and page. */
export function readQuery(params: URLSearchParams): ListQuery {
  const tab = params.get("tab") ?? "open";
  const page = Number(params.get("page"));
  return {
    tab: TAB_VALUES.has(tab) ? (tab as OrderTab) : "open",
    q: params.get("q") ?? "",
    debt: params.get("debt") === "true",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Query string for both the address bar and the API; defaults are left out. */
export function queryString({ tab, q, debt, page }: ListQuery): string {
  const params = new URLSearchParams();
  if (tab !== "open") params.set("tab", tab);
  if (q.trim()) params.set("q", q.trim());
  if (debt) params.set("debt", "true");
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

/** Days in the shop: amber from 7, red from 30, as in design 1.4. */
export const daysLevel = (days: number): "normal" | "warning" | "danger" =>
  days >= 30 ? "danger" : days >= 7 ? "warning" : "normal";
