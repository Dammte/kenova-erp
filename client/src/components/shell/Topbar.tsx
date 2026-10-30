"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, KeyRound, LogOut, Store } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL, apiFetch } from "@/lib/api";
import styles from "./Topbar.module.css";

const ROLE_LABEL = { SUPER_ADMIN: "Socio", STORE_ADMIN: "Tienda" } as const;

/** "Ana Rojo" → "AR". */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

/** Name of the store a STORE_ADMIN works in; partners see every store. */
function useStoreName(storeId: string | null): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!storeId) return;
    let alive = true;
    apiFetch(`${API_URL}/stores/${storeId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((store: { name?: string } | null) => {
        if (alive && store?.name) setName(store.name);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [storeId]);
  return storeId ? name : "Todas las tiendas";
}

/**
 * Design 1.2: the store and the user menu on the right, where people expect
 * them. Each screen keeps its own title.
 */
export default function Topbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const storeName = useStoreName(user?.storeId ?? null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Close the menu when the user goes to another page.
  useEffect(() => setOpen(false), [pathname]);

  if (!user) return null;

  return (
    <header className={styles.topbar}>
      {/* The search (Ctrl+K) goes on the left in the next step. */}
      <div />

      <div className={styles.right}>
        {storeName && (
          <span className={styles.store}>
            <Store size={16} aria-hidden />
            {storeName}
          </span>
        )}

        <div className={styles.account} ref={wrap}>
          <button
            type="button"
            className={styles.user}
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={styles.avatar} aria-hidden>
              {initials(user.fullName)}
            </span>
            <span className={styles.who}>
              <span className={styles.name}>{user.fullName}</span>
              <span className={styles.role}>{ROLE_LABEL[user.role]}</span>
            </span>
            <ChevronDown size={16} aria-hidden />
          </button>

          {open && (
            <div id={menuId} className={styles.menu}>
              <p className={styles.menuHead}>
                <span className={styles.name}>{user.fullName}</span>
                <span className={styles.role}>{user.email}</span>
              </p>
              <Link href="/cuenta/contrasena" className={styles.menuItem}>
                <KeyRound size={16} aria-hidden />
                Cambiar contraseña
              </Link>
              <button type="button" className={styles.menuItem} onClick={logout}>
                <LogOut size={16} aria-hidden />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
