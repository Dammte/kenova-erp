import {
  ClipboardList,
  LayoutDashboard,
  Package,
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

const PANEL: NavItem = { label: "Panel", href: "/dashboard", icon: LayoutDashboard };
const ORDERS: NavItem = { label: "Órdenes", href: "/serviceOrders", icon: ClipboardList };
const CLIENTS: NavItem = { label: "Clientes", href: "/clients", icon: Users };
const INVENTORY: NavItem = { label: "Inventario", href: "/inventory", icon: Package };
const SERVICES: NavItem = { label: "Servicios", href: "/services", icon: Wrench };
const USERS: NavItem = { label: "Usuarios", href: "/usuarios", icon: UserCog };

/**
 * The menu approved for each role. Sections whose screen does not exist yet
 * (Presupuestos, Tarifas, Envíos, Dinero, Tienda, Catálogo, Plantillas,
 * Papelera, Copia de seguridad) are added as each screen is built. Stock and
 * settings belong to the partners only.
 */
export function navFor(role: Role): NavSections {
  if (role === "SUPER_ADMIN") {
    return {
      main: [PANEL, ORDERS, CLIENTS, INVENTORY],
      settings: [SERVICES, USERS],
    };
  }
  return { main: [PANEL, ORDERS, CLIENTS], settings: [] };
}

/** Whether a menu entry is the section the user is in. */
export const isActive = (href: string, pathname: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);
