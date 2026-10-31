"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ClipboardList, Plus, Search, User, type LucideIcon } from "lucide-react";
import type { Role } from "@/components/auth/AuthProvider";
import { STATUS_LABEL, type OrderStatus } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { navFor } from "./nav";
import styles from "./CommandPalette.module.css";

interface SearchResult {
  orders: { id: string; code: string; status: string; clientName: string; device: string }[];
  clients: { id: string; name: string; phoneNumber: string | null }[];
}

interface Item {
  key: string;
  group: "Acciones" | "Órdenes" | "Clientes";
  label: string;
  detail?: string;
  href: string;
  icon: LucideIcon;
}

/** Results per group, as in design 1.2. */
const PER_GROUP = 4;

/** Lowercases and drops accents, as the server search does. */
export const fold = (text: string): string =>
  text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function actionsFor(role: Role, query: string): Item[] {
  const { main, settings } = navFor(role);
  const all: Item[] = [
    {
      key: "new-order",
      group: "Acciones",
      label: "Nueva orden",
      href: "/ordenes/nueva",
      icon: Plus,
    },
    ...[...main, ...settings].map((n) => ({
      key: n.href,
      group: "Acciones" as const,
      label: `Ir a ${n.label}`,
      href: n.href,
      icon: n.icon,
    })),
  ];
  const q = fold(query.trim());
  return q ? all.filter((a) => fold(a.label).includes(q)) : all;
}

/** Asks the server once the user stops typing; older answers are dropped. */
function useSearch(query: string): { result: SearchResult | null; loading: boolean } {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResult(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      apiFetch(`${API_URL}/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: SearchResult | null) => {
          if (!alive) return;
          setResult(body ?? { orders: [], clients: [] });
          setLoading(false);
        })
        .catch(() => {
          if (!alive) return;
          setResult({ orders: [], clients: [] });
          setLoading(false);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);
  return { result, loading };
}

interface Props {
  role: Role;
  onClose: () => void;
}

/**
 * Design 1.2: the counter's main shortcut. Finds orders and clients by code,
 * name, phone, DNI or IMEI, and jumps to any section.
 */
export default function CommandPalette({ role, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const { result, loading } = useSearch(query);

  const items = useMemo<Item[]>(() => {
    const orders: Item[] = (result?.orders ?? []).slice(0, PER_GROUP).map((o) => ({
      key: `o-${o.id}`,
      group: "Órdenes",
      label: `${o.code} · ${o.clientName}`,
      detail: [o.device, STATUS_LABEL[o.status as OrderStatus] ?? o.status]
        .filter(Boolean)
        .join(" · "),
      href: `/serviceOrders/${o.id}`,
      icon: ClipboardList,
    }));
    const clients: Item[] = (result?.clients ?? []).slice(0, PER_GROUP).map((c) => ({
      key: `c-${c.id}`,
      group: "Clientes",
      label: c.name,
      detail: c.phoneNumber ?? undefined,
      href: `/clients/${c.id}`,
      icon: User,
    }));
    return [...actionsFor(role, query).slice(0, PER_GROUP), ...orders, ...clients];
  }, [result, role, query]);

  useEffect(() => setActive(0), [items]);

  // Focus the field on open and give focus back to where it was on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const open = (item: Item) => {
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      open(items[active]);
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const searched = query.trim().length >= 2 && !loading;
  const nothing = searched && items.length === 0;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        className={styles.palette}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.field}>
          <Search size={18} aria-hidden className={styles.icon} />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Buscar orden, cliente, teléfono, DNI o IMEI"
            placeholder="Orden, cliente, teléfono, DNI, IMEI…"
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose}>
            <span className={styles.closeKey}>Esc</span>
            <span className={styles.closeWord}>Cerrar</span>
          </button>
        </div>

        <ul id={listId} role="listbox" aria-label="Resultados" className={styles.list}>
          {items.map((item, i) => (
            <li key={item.key} role="presentation">
              {(i === 0 || items[i - 1].group !== item.group) && (
                <div className={styles.group} aria-hidden>
                  {item.group}
                </div>
              )}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                onMouseMove={() => setActive(i)}
                onClick={() => open(item)}
              >
                <item.icon size={16} aria-hidden className={styles.icon} />
                <span className={styles.text}>
                  <span className={styles.label}>{item.label}</span>
                  {item.detail && <span className={styles.detail}>{item.detail}</span>}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <p className={styles.status} role="status">
          {loading
            ? "Buscando…"
            : nothing
              ? `Nada con «${query.trim()}». Prueba con el teléfono, el DNI o el nº de orden.`
              : ""}
        </p>

        <div className={styles.footer} aria-hidden>
          <span>↑↓ moverse</span>
          <span>↵ abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
