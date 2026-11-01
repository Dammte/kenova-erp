import {
  ClipboardList,
  Coins,
  DatabaseBackup,
  FileText,
  Library,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Store,
  Tags,
  Trash2,
  Truck,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/components/auth/AuthProvider";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSections {
  main: NavItem[];
  /** Settings, shown apart and last: they are rarely touched. */
  settings: NavItem[];
}

const PANEL: NavItem = { label: "Panel", href: "/panel", icon: LayoutDashboard };
const ORDERS: NavItem = { label: "Órdenes", href: "/ordenes", icon: ClipboardList };
const QUOTES: NavItem = { label: "Presupuestos", href: "/presupuestos", icon: FileText };
const RATES: NavItem = { label: "Tarifas", href: "/tarifas", icon: Tags };
const CLIENTS: NavItem = { label: "Clientes", href: "/clientes", icon: Users };
const MONEY: NavItem = { label: "Dinero", href: "/dinero", icon: Coins };
const INVENTORY: NavItem = { label: "Inventario", href: "/inventario", icon: Package };
const SERVICES: NavItem = { label: "Servicios", href: "/servicios", icon: Wrench };
const TEMPLATES: NavItem = { label: "Plantillas", href: "/plantillas", icon: MessageSquareText };
const USERS: NavItem = { label: "Usuarios", href: "/usuarios", icon: UserCog };
const SHIPMENTS: NavItem = { label: "Envíos", href: "/envios", icon: Truck };
const CATALOG: NavItem = { label: "Catálogo", href: "/catalogo", icon: Library };
const TRASH: NavItem = { label: "Papelera", href: "/papelera", icon: Trash2 };
const STORE: NavItem = { label: "Tienda", href: "/tienda", icon: Store };
const BACKUP: NavItem = { label: "Copia de seguridad", href: "/copia-seguridad", icon: DatabaseBackup };

/**
 * The menu approved for each role. Stock belongs to the partners only; a store's only
 * setting is its own notice texts (design 2.5). «Envíos» only when there are
 * partner stores (see usePartnerStores).
 */
export function navFor(role: Role, shipments = false): NavSections {
  const ship = shipments ? [SHIPMENTS] : [];
  if (role === "SUPER_ADMIN") {
    return {
      main: [PANEL, ORDERS, ...ship, QUOTES, RATES, CLIENTS, INVENTORY, MONEY],
      settings: [SERVICES, CATALOG, TEMPLATES, USERS, STORE, TRASH, BACKUP],
    };
  }
  return { main: [PANEL, ORDERS, ...ship, QUOTES, RATES, CLIENTS, MONEY], settings: [TEMPLATES] };
}

/**
 * Older screens a section still owns: an order opens on /serviceOrders/... until
 * its new screen exists.
 */
const ALSO_UNDER: Record<string, string[]> = {
  "/ordenes": ["/serviceOrders"],
  "/panel": ["/dashboard"],
  "/clientes": ["/clients"],
  "/inventario": ["/inventory"],
  "/servicios": ["/services"],
};

const isUnder = (href: string, pathname: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Whether a menu entry is the section the user is in. */
export const isActive = (href: string, pathname: string): boolean =>
  [href, ...(ALSO_UNDER[href] ?? [])].some((h) => isUnder(h, pathname));
