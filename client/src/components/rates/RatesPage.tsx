"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  choicesFor,
  groupRates,
  pushRecent,
  readRecent,
  whatsappText,
  type Choice,
  type RateGroup,
  type RateRow,
} from "./rates";
import styles from "./Rates.module.css";

const DEBOUNCE_MS = 250;

const CHOICE_LABEL: Record<Choice, string> = { both: "Ambas", compatible: "Compatible", original: "Original" };

function Stock({ row }: { row: RateRow }) {
  if (!row.stock) return null;
  const { units, low } = row.stock;
  if (units <= 0) return <span className={styles.out}>Sin stock: se pide</span>;
  return <span className={low ? styles.low : styles.stock}>En stock {units}{low && " · bajo"}</span>;
}

function Price({ row }: { row: RateRow | null }) {
  if (!row) return <span className={styles.none} aria-label="No se ofrece">—</span>;
  return (
    <span className={styles.price}>
      <strong>{formatEur(Number(row.price))}</strong>
      <Stock row={row} />
    </span>
  );
}

/** The text for the customer, with the price to quote and a copy button. */
function WhatsApp({ group }: { group: RateGroup }) {
  const choices = choicesFor(group);
  const [choice, setChoice] = useState<Choice>(choices[0] ?? "compatible");
  const [copied, setCopied] = useState(false);
  const text = whatsappText(group, choice);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.whatsapp} aria-label="Texto para WhatsApp" role="region">
      {choices.length > 1 && (
        <div className={styles.chips} role="radiogroup" aria-label="Precio que se cita">
          {choices.map((c) => (
            <label key={c} className={styles.chip}>
              <input
                type="radio"
                name={`choice-${group.key}`}
                checked={choice === c}
                onChange={() => {
                  setChoice(c);
                  setCopied(false);
                }}
              />
              {CHOICE_LABEL[c]}
            </label>
          ))}
        </div>
      )}
      <p className={styles.message}>{text}</p>
      <p className={styles.copyRow}>
        <Button variant="primary" size="sm" icon={<Copy size={16} aria-hidden />} onClick={() => void copy()}>
          Copiar para WhatsApp
        </Button>
        <span role="status" className={styles.muted}>
          {copied ? "Copiado." : ""}
        </span>
      </p>
    </div>
  );
}

/**
 * Design 2.3 "Tarifas": answers «¿cuánto cuesta…?» at the counter or on the
 * phone in a few seconds, and turns the answer into a WhatsApp message.
 */
export function RatesPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RateRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setRecent(readRecent()), []);

  const typed = query.trim();
  useEffect(() => {
    if (typed.length < 2) {
      setRows(null);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch(`${API_URL}/services/rates?q=${encodeURIComponent(typed)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const found = (await res.json()) as RateRow[];
          setRows(found);
          setFailed(false);
          setOpen(null);
          if (found.length) setRecent((list) => pushRecent(list, typed));
        })
        .catch(() => !controller.signal.aborted && setFailed(true));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed]);

  const groups = rows ? groupRates(rows) : [];
  const search = (q: string) => {
    setQuery(q);
    input.current?.focus();
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Tarifas</h1>

      <div className={styles.searchBox}>
        <Search size={18} aria-hidden className={styles.searchIcon} />
        <input
          ref={input}
          type="search"
          className={styles.search}
          aria-label="Buscar tarifa"
          placeholder="Reparación y modelo: batería a54, pantalla 12 pro…"
          autoComplete="off"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {recent.length > 0 && (
        <p className={styles.recent}>
          <span className={styles.muted}>Recientes:</span>
          {recent.map((r) => (
            <button key={r} type="button" className={styles.chip} onClick={() => search(r)}>
              {r}
            </button>
          ))}
        </p>
      )}

      {failed && (
        <p className={styles.error} role="alert">
          No se han podido cargar las tarifas. Prueba otra vez.
        </p>
      )}
      {!failed && rows && groups.length === 0 && (
        <p className={styles.muted}>
          Ninguna tarifa coincide con «{typed}». Prueba con menos palabras o solo el modelo.
        </p>
      )}
      {!rows && !failed && (
        <p className={styles.muted}>Escribe la reparación, el modelo o ambos. No hace falta poner tildes.</p>
      )}

      <ul className={styles.results}>
        {groups.map((g) => (
          <li key={g.key} className={styles.card}>
            <div className={styles.head}>
              <div>
                <p className={styles.model}>{g.model?.name ?? "General"}</p>
                {g.model?.brand && <p className={styles.muted}>{g.model.brand}</p>}
              </div>
              <Button
                size="sm"
                variant={open === g.key ? "secondary" : "ghost"}
                aria-expanded={open === g.key}
                onClick={() => setOpen(open === g.key ? null : g.key)}
              >
                {open === g.key ? "Cerrar texto" : "Copiar"}
              </Button>
            </div>
            <dl className={styles.grid}>
              <div>
                <dt>Reparación</dt>
                <dd>{g.repair}</dd>
              </div>
              {g.single ? (
                <div>
                  <dt>Precio</dt>
                  <dd>
                    <Price row={g.single} />
                  </dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>Compatible</dt>
                    <dd>
                      <Price row={g.compatible} />
                    </dd>
                  </div>
                  <div>
                    <dt>Original</dt>
                    <dd>
                      <Price row={g.original} />
                    </dd>
                  </div>
                </>
              )}
              <div>
                <dt>Tiempo</dt>
                <dd>{g.estimatedTime ?? "—"}</dd>
              </div>
            </dl>
            {open === g.key && <WhatsApp group={g} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
