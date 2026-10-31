"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Menu, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isActive, navFor, type NavItem } from "./nav";
import styles from "./BottomBar.module.css";

/** Event the "Buscar" tab sends; the top bar opens the search on it. */
export const OPEN_SEARCH_EVENT = "kenova:open-search";

/** Sections that get their own tab; the rest live under «Menú». */
const TABS = ["/dashboard", "/ordenes"];

/**
 * Design 1.2, phone: the side bar becomes a bottom bar with the daily
 * sections, «Nueva», «Buscar» and a «Menú» sheet with everything else.
 */
export default function BottomBar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const sheetId = useId();

  // Close the sheet when the user goes to another page.
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!user) return null;
  const { main, settings } = navFor(user.role);
  const tabs = main.filter((n) => TABS.includes(n.href));
  const more = main.filter((n) => !TABS.includes(n.href));
  const menuActive = [...more, ...settings].some((n) => isActive(n.href, pathname));

  const tab = ({ label, href, icon: Icon }: NavItem) => (
    <Link
      key={href}
      href={href}
      className={styles.tab}
      aria-current={isActive(href, pathname) ? "page" : undefined}
    >
      <Icon size={22} aria-hidden />
      {label}
    </Link>
  );

  const sheetLink = ({ label, href, icon: Icon }: NavItem) => (
    <li key={href}>
      <Link
        href={href}
        className={styles.sheetItem}
        aria-current={isActive(href, pathname) ? "page" : undefined}
      >
        <Icon size={20} aria-hidden />
        {label}
      </Link>
    </li>
  );

  return (
    <>
      {menuOpen && (
        <div className={styles.backdrop} onClick={() => setMenuOpen(false)}>
          <div
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className={styles.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHead}>
              <span className={styles.sheetTitle}>Menú</span>
              <button
                type="button"
                className={styles.close}
                aria-label="Cerrar menú"
                onClick={() => setMenuOpen(false)}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <ul className={styles.sheetList}>{more.map(sheetLink)}</ul>
            {settings.length > 0 && (
              <>
                <p className={styles.heading}>Configuración</p>
                <ul className={styles.sheetList}>{settings.map(sheetLink)}</ul>
              </>
            )}
          </div>
        </div>
      )}

      <nav className={styles.bar} aria-label="Menú principal">
        {tabs.map(tab)}
        <Link href="/ordenes/nueva" className={styles.create}>
          <span className={styles.createIcon}>
            <Plus size={22} aria-hidden />
          </span>
          Nueva
        </Link>
        <button
          type="button"
          className={styles.tab}
          onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
        >
          <Search size={22} aria-hidden />
          Buscar
        </button>
        <button
          type="button"
          className={styles.tab}
          aria-expanded={menuOpen}
          aria-controls={sheetId}
          aria-current={menuActive ? "page" : undefined}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Menu size={22} aria-hidden />
          Menú
        </button>
      </nav>
    </>
  );
}
