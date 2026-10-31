import {
  ClipboardList,
  Coins,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Tags,
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
const CLIENTS: NavItem = { label: "Clientes", href: "/clients", icon: Users };
const MONEY: NavItem = { label: "Dinero", href: "/dinero", icon: Coins };
const INVENTORY: NavItem = { label: "Inventario", href: "/inventory", icon: Package };
const SERVICES: NavItem = { label: "Servicios", href: "/services", icon: Wrench };
const TEMPLATES: NavItem = { label: "Plantillas", href: "/plantillas", icon: MessageSquareText };
const USERS: NavItem = { label: "Usuarios", href: "/usuarios", icon: UserCog };

/**
 * The menu approved for each role. Sections whose screen does not exist yet
 * (Envíos, Tienda, Catálogo, Papelera, Copia de seguridad) are added
 * as each screen is built. Stock belongs to the partners only; a store's only
 * setting is its own notice texts (design 2.5).
 */
export function navFor(role: Role): NavSections {
  if (role === "SUPER_ADMIN") {
    return {
      main: [PANEL, ORDERS, QUOTES, RATES, CLIENTS, INVENTORY, MONEY],
      settings: [SERVICES, TEMPLATES, USERS],
    };
  }
  return { main: [PANEL, ORDERS, QUOTES, RATES, CLIENTS, MONEY], settings: [TEMPLATES] };
}

/**
 * Older screens a section still owns: an order opens on /serviceOrders/... until
 * its new screen exists.
 */
const ALSO_UNDER: Record<string, string[]> = { "/ordenes": ["/serviceOrders"], "/panel": ["/dashboard"] };

const isUnder = (href: string, pathname: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Whether a menu entry is the section the user is in. */
export const isActive = (href: string, pathname: string): boolean =>
  [href, ...(ALSO_UNDER[href] ?? [])].some((h) => isUnder(h, pathname));
