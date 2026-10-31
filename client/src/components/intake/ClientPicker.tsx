"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { UserPlus } from "lucide-react";
import { Button, TextField } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { isKnown, newClientFrom, type FoundClient, type NewClient } from "./intake";
import styles from "./Intake.module.css";

/** Design 1.3: results from 2 characters, after 150 ms without typing. */
export const SEARCH_DELAY_MS = 150;

const fullName = (c: { firstName: string; lastName: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ");

/**
 * Block 1 of the intake: find the client by name, phone, email or DNI, or
 * start a new one from what was typed. "Cliente nuevo" is always the last row,
 * also while the search is loading, so the counter is never blocked.
 */
export function ClientPicker({
  value,
  onChange,
}: {
  value: FoundClient | NewClient | null;
  onChange: (client: FoundClient | NewClient | null) => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value === null) searchRef.current?.focus();
  }, [value]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setFound([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      apiFetch(`${API_URL}/clients/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(async (res) => (res.ok ? ((await res.json()) as FoundClient[]) : []))
        .catch(() => [])
        .then((list) => {
          if (controller.signal.aborted) return;
          setFound(list.slice(0, 6));
          setActive(0);
          setLoading(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  if (value && isKnown<FoundClient>(value)) {
    return (
      <div className={styles.chosen}>
        <span className={styles.avatar} aria-hidden>
          {value.firstName[0]}
          {value.lastName?.[0] ?? ""}
        </span>
        <span className={styles.chosenText}>
          <strong>{fullName(value)}</strong>
          <span className={styles.muted}>
            {[value.phoneNumber, value.dni && `${value.dniType ?? ""} ${value.dni}`.trim()].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          Cambiar
        </Button>
      </div>
    );
  }

  if (value) {
    const set = (patch: Partial<NewClient>) => onChange({ ...value, ...patch });
    return (
      <div className={styles.grid2}>
        <TextField name="client-name" label="Nombre" required autoFocus value={value.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        <TextField label="Apellidos" value={value.lastName} onChange={(e) => set({ lastName: e.target.value })} />
        <TextField
          name="client-phone"
          label="Teléfono"
          required
          inputMode="tel"
          prefix="+34"
          value={value.phoneNumber}
          onChange={(e) => set({ phoneNumber: e.target.value })}
        />
        <TextField label="Email" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} />
        <p className={styles.full}>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Buscar un cliente existente
          </Button>
        </p>
      </div>
    );
  }

  const rows = found.length + 1;
  const pick = (i: number) => (i < found.length ? onChange(found[i]) : onChange(newClientFrom(q)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % rows);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + rows) % rows);
    } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      pick(active);
    }
  };
  const typed = q.trim();

  return (
    <div className={styles.search}>
      <TextField
        name="client-search"
        ref={searchRef}
        label="Buscar cliente · nombre, teléfono, email o DNI"
        autoComplete="off"
        role="combobox"
        aria-expanded={typed.length >= 2}
        aria-controls="client-results"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
      />
      {typed.length >= 2 && (
        <ul id="client-results" className={styles.results} role="listbox" aria-busy={loading}>
          {found.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button type="button" className={styles.result} onClick={() => pick(i)} onMouseEnter={() => setActive(i)}>
                <strong>{fullName(c)}</strong>
                <span className={styles.muted}>
                  {[c.phoneNumber, c.dni && `${c.dniType ?? ""} ${c.dni}`.trim()].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
          {!loading && found.length === 0 && (
            <li className={styles.empty} aria-hidden>
              Ningún cliente coincide con «{typed}».
            </li>
          )}
          <li role="option" aria-selected={active === found.length}>
            <button type="button" className={styles.result} onClick={() => pick(found.length)}>
              <span className={styles.newRow}>
                <UserPlus size={16} aria-hidden /> Cliente nuevo
              </span>
              <span className={styles.muted}>{describeNew(newClientFrom(typed))}</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function describeNew(c: NewClient): string {
  return [
    c.firstName && `Nombre: ${c.firstName}`,
    c.phoneNumber && `Teléfono: ${c.phoneNumber}`,
    c.email && `Email: ${c.email}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
