"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isActive, navFor, type NavItem } from "./nav";
import styles from "./Sidebar.module.css";

/** Below this width (tablet) the bar starts folded. */
const FOLD_BELOW = 1280;
const prefKey = (userId: string) => `kenova.sidebar.collapsed.${userId}`;

function readPref(userId: string): boolean | null {
  try {
    const v = localStorage.getItem(prefKey(userId));
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

function writePref(userId: string, collapsed: boolean) {
  try {
    localStorage.setItem(prefKey(userId), collapsed ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the bar still works, just not remembered.
  }
}

/**
 * Design 1.2: fixed side bar that folds only on click or Ctrl+B, never on
 * hover. Open (240 px) on desktop, folded to icons with labels (72 px) on
 * tablet; the choice is remembered per user.
 */
export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!user) return;
    setCollapsed(readPref(user.id) ?? window.innerWidth < FOLD_BELOW);
  }, [user]);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      if (user) writePref(user.id, !c);
      return !c;
    });
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  if (!user) return null;
  const { main, settings } = navFor(user.role);

  const link = ({ label, href, icon: Icon }: NavItem) => {
    const active = isActive(href, pathname);
    return (
      <li key={href}>
        <Link
          href={href}
          className={styles.item}
          aria-current={active ? "page" : undefined}
          title={collapsed ? label : undefined}
        >
          <Icon size={20} aria-hidden />
          <span className={styles.label}>{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside
      className={styles.sidebar}
      data-collapsed={collapsed ? "" : undefined}
      aria-label="Menú principal"
    >
      <div className={styles.brand}>{collapsed ? "K" : "Kenova"}</div>

      <Link
        href="/serviceOrders/newServiceOrder"
        className={styles.create}
        aria-label={collapsed ? "Nueva orden" : undefined}
        title={collapsed ? "Nueva orden" : undefined}
      >
        <Plus size={20} aria-hidden />
        <span className={styles.label}>{collapsed ? "Nueva" : "Nueva orden"}</span>
      </Link>

      <nav className={styles.nav}>
        <ul className={styles.list}>{main.map(link)}</ul>
        {settings.length > 0 && (
          <>
            <p className={styles.heading}>Configuración</p>
            <ul className={styles.list}>{settings.map(link)}</ul>
          </>
        )}
      </nav>

      <div className={styles.footer}>
        <ul className={styles.list}>
          <li>
            <button
              type="button"
              onClick={toggle}
              className={styles.item}
              aria-expanded={!collapsed}
              title={collapsed ? "Desplegar barra (Ctrl+B)" : "Plegar barra (Ctrl+B)"}
            >
              {collapsed ? (
                <PanelLeftOpen size={20} aria-hidden />
              ) : (
                <PanelLeftClose size={20} aria-hidden />
              )}
              <span className={styles.label}>
                {collapsed ? "Desplegar" : "Plegar barra"}
              </span>
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}
