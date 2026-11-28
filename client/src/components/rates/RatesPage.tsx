"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { formatMoneyInput, parseMoney } from "@/lib/money";
import {
  buildMatrix,
  cellRate,
  choicesFor,
  pushRecent,
  readRecent,
  whatsappText,
  type Choice,
  type Quality,
  type RateGroup,
  type RateRow,
} from "./rates";
import { RateEditor } from "./RateEditor";
import styles from "./Rates.module.css";

const CHOICE_LABEL: Record<Choice, string> = { both: "Ambas", compatible: "Compatible", original: "Original" };

function Stock({ row }: { row: RateRow }) {
  if (!row.stock) return null;
  const { units, low } = row.stock;
  if (units <= 0) return <span className={styles.out}>Sin stock: se pide</span>;
  return <span className={low ? styles.low : styles.stock}>En stock {units}{low && " · bajo"}</span>;
}

function Price({ row, onEdit }: { row: RateRow | null; onEdit?: (id: string) => void }) {
  if (!row) return <span className={styles.none} aria-label="No se ofrece">—</span>;
  return (
    <span className={styles.price}>
      <strong>{formatEur(Number(row.price))}</strong>
      <Stock row={row} />
      {onEdit && (
        <button type="button" className={styles.edit} aria-label={`Editar ${row.name}`} onClick={() => onEdit(row.id)}>
          Editar
        </button>
      )}
    </span>
  );
}

/** The rate an intake starts with: the quoted one, or the compatible when both are quoted. */
function intakeRate(g: RateGroup, choice: Choice): RateRow | null {
  if (choice === "original") return g.original;
  return g.single ?? g.compatible ?? g.original;
}

/** The text for the customer, with the price to quote and a copy button. */
function WhatsApp({ group }: { group: RateGroup }) {
  const choices = choicesFor(group);
  const [choice, setChoice] = useState<Choice>(choices[0] ?? "compatible");
  const [copied, setCopied] = useState(false);
  const text = whatsappText(group, choice);
  const start = intakeRate(group, choice);

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
        {start && (
          <Link className={styles.intake} href={`/ordenes/nueva?servicio=${start.id}`}>
            <Plus size={16} aria-hidden /> Dar de alta
          </Link>
        )}
        {start && (
          <Link className={styles.intake} href={`/presupuestos?presupuesto=nuevo&servicio=${start.id}`}>
            <FileText size={16} aria-hidden /> Crear presupuesto
          </Link>
        )}
        <span role="status" className={styles.muted}>
          {copied ? "Copiado." : ""}
        </span>
      </p>
    </div>
  );
}

const QUALITIES: [Quality, string][] = [
  ["compatible", "Compatible"],
  ["original", "Original"],
];

type CellState = "idle" | "saving" | "bad" | "failed";

/**
 * Design R3 decision 08: in «Editar matriz» a cell is the price field itself.
 * Tab moves on and saves, Intro saves, Esc puts the price back.
 */
function PriceCell({ rate, label, onSaved }: { rate: RateRow; label: string; onSaved: (price: string) => void }) {
  const saved = formatMoneyInput(Number(rate.price));
  const [text, setText] = useState(saved);
  const [state, setState] = useState<CellState>("idle");

  const save = async () => {
    if (text === saved) return setState("idle");
    const price = parseMoney(text);
    if (price === null) return setState("bad");
    setState("saving");
    try {
      const res = await apiFetch(`${API_URL}/services/${rate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("idle");
      onSaved(price.toFixed(2));
    } catch {
      setState("failed");
    }
  };

  const problem = state === "bad" ? "Precio no válido" : state === "failed" ? "No se ha guardado" : null;
  return (
    <span className={styles.editCell}>
      <input
        className={styles.priceInput}
        inputMode="decimal"
        aria-label={`Precio ${label}`}
        aria-invalid={problem ? true : undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (state !== "saving") setState("idle");
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") {
            setText(saved);
            setState("idle");
          }
        }}
      />
      <span className={problem ? styles.out : styles.muted} role={problem ? "alert" : undefined}>
        {problem ?? (state === "saving" ? "Guardando…" : "\u00a0")}
      </span>
    </span>
  );
}

/** The chosen repair for one model: its prices, the time and the WhatsApp text. */
function RateCard({
  group,
  onEdit,
  editing,
  onEditDone,
}: {
  group: RateGroup;
  onEdit?: (id: string) => void;
  editing: string | null;
  onEditDone: (saved: boolean) => void;
}) {
  const g = group;
  return (
    <section className={styles.card} aria-label="Tarifa elegida">
      <div>
        <p className={styles.model}>
          {g.repair} · {g.model?.name ?? "General"}
        </p>
        {g.model?.brand && <p className={styles.muted}>{g.model.brand}</p>}
      </div>
      <dl className={styles.grid}>
        {g.single ? (
          <div>
            <dt>Precio</dt>
            <dd>
              <Price row={g.single} onEdit={onEdit} />
            </dd>
          </div>
        ) : (
          <>
            <div>
              <dt>Compatible</dt>
              <dd>
                <Price row={g.compatible} onEdit={onEdit} />
              </dd>
            </div>
            <div>
              <dt>Original</dt>
              <dd>
                <Price row={g.original} onEdit={onEdit} />
              </dd>
            </div>
          </>
        )}
        <div>
          <dt>Tiempo</dt>
          <dd>{g.estimatedTime ?? "—"}</dd>
        </div>
      </dl>
      {editing && [g.single, g.compatible, g.original].some((r) => r?.id === editing) ? (
        <RateEditor id={editing} onCancel={() => onEditDone(false)} onSaved={() => onEditDone(true)} />
      ) : (
        <WhatsApp key={g.key} group={g} />
      )}
    </section>
  );
}

/**
 * Design R3 «Tarifas · matriz» (design 2.3 before it): answers «¿cuánto
 * cuesta…?» at the counter in a few seconds. A row per model, a column per
 * repair; the chosen cell gives the WhatsApp text, the intake and the quote.
 */
export function RatesPage() {
  const [filter, setFilter] = useState("");
  const [quality, setQuality] = useState<Quality>("compatible");
  const [rows, setRows] = useState<RateRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editMatrix, setEditMatrix] = useState(false);
  const { user } = useAuth();
  // Decision: the partners keep the price list; stores only read it.
  const onEdit = user?.role === "SUPER_ADMIN" ? setEditing : undefined;
  const input = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => setRecent(readRecent()), []);

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(`${API_URL}/services/rates/all`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const all = (await res.json()) as RateRow[];
        if (live) setRows(all);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [reload]);

  const matrix = buildMatrix(rows ?? [], filter);
  const cellKey = (rowKey: string, repair: string) => `${rowKey}|${repair}`;
  const pickedGroup = picked
    ? matrix.rows.flatMap((r) => Object.entries(r.cells).map(([repair, g]) => [cellKey(r.key, repair), g] as const))
        .find(([k]) => k === picked)?.[1]
    : undefined;

  const pick = (key: string) => {
    setPicked(key);
    setEditing(null);
    setRecent((list) => pushRecent(list, filter));
    // On a narrow screen the card is under the table.
    requestAnimationFrame(() => card.current?.scrollIntoView?.({ block: "nearest" }));
  };
  const applyRecent = (q: string) => {
    setFilter(q);
    setPicked(null);
    input.current?.focus();
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Tarifas</h1>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} aria-hidden className={styles.searchIcon} />
          <input
            ref={input}
            type="search"
            className={styles.search}
            aria-label="Filtrar tarifas"
            placeholder="Modelo o reparación: a54, batería iphone 1…"
            autoComplete="off"
            autoFocus
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setEditing(null);
            }}
          />
        </div>
        <div className={styles.segmented} role="radiogroup" aria-label="Calidad de la pieza">
          {QUALITIES.map(([q, label]) => (
            <label key={q} className={styles.segment}>
              <input type="radio" name="quality" checked={quality === q} onChange={() => setQuality(q)} />
              {label}
            </label>
          ))}
        </div>
        {onEdit && (
          <Button size="sm" variant={editMatrix ? "primary" : "secondary"} onClick={() => setEditMatrix((on) => !on)}>
            {editMatrix ? "Terminar edición" : "Editar matriz"}
          </Button>
        )}
      </div>

      {recent.length > 0 && (
        <p className={styles.recent}>
          <span className={styles.muted}>Recientes:</span>
          {recent.map((r) => (
            <button key={r} type="button" className={styles.chip} onClick={() => applyRecent(r)}>
              {r}
            </button>
          ))}
        </p>
      )}

      {failed ? (
        <p className={styles.error} role="alert">
          No se han podido cargar las tarifas. Prueba otra vez.
        </p>
      ) : !rows ? (
        <p className={styles.muted}>Cargando las tarifas…</p>
      ) : rows.length === 0 ? (
        <p className={styles.muted}>Aún no hay tarifas. Se añaden desde Servicios.</p>
      ) : matrix.rows.length === 0 ? (
        <p className={styles.muted}>
          Ninguna tarifa coincide con «{filter.trim()}». Prueba con menos palabras o solo el modelo.
        </p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.matrixWrap}>
            <table className={styles.matrix} aria-label="Tarifas por modelo y reparación">
              <thead>
                <tr>
                  <th scope="col">Modelo</th>
                  {matrix.repairs.map((r) => (
                    <th key={r} scope="col">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      <span className={styles.rowName}>
                        <strong>{row.model?.name ?? "General"}</strong>
                        {row.model?.brand && <span className={styles.muted}>{row.model.brand}</span>}
                      </span>
                    </th>
                    {matrix.repairs.map((repair) => {
                      const g = row.cells[repair];
                      if (!g) {
                        return (
                          <td key={repair} className={styles.empty} aria-label="No se hace">
                            —
                          </td>
                        );
                      }
                      const { rate, fallback } = cellRate(g, quality);
                      const key = cellKey(row.key, repair);
                      const price = rate ? formatEur(Number(rate.price)) : "—";
                      const stock = rate?.stock;
                      const label = `${repair} ${row.model?.name ?? "general"}`;
                      // Only the price of the quality shown; a fallback is another rate.
                      if (editMatrix && onEdit && rate && !fallback) {
                        return (
                          <td key={repair}>
                            <PriceCell
                              key={`${rate.id}-${rate.price}`}
                              rate={rate}
                              label={label}
                              onSaved={(next) =>
                                setRows((all) => all && all.map((r) => (r.id === rate.id ? { ...r, price: next } : r)))
                              }
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={repair}>
                          <button
                            type="button"
                            className={styles.cell}
                            aria-pressed={picked === key}
                            aria-label={`${label}: ${price}`}
                            onClick={() => pick(key)}
                          >
                            <strong>{price}</strong>
                            {stock ? (
                              <span className={stock.units > 0 ? styles.stock : styles.out}>
                                {stock.units > 0 ? `stock ${stock.units}` : "sin stock"}
                              </span>
                            ) : fallback ? (
                              <span className={styles.muted}>solo {rate?.quality}</span>
                            ) : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div ref={card} className={styles.side}>
            {pickedGroup ? (
              <RateCard
                group={pickedGroup}
                onEdit={onEdit}
                editing={editing}
                onEditDone={(saved) => {
                  setEditing(null);
                  if (saved) setReload((n) => n + 1);
                }}
              />
            ) : (
              <p className={styles.muted}>Elige una celda para ver el precio, el texto para WhatsApp y dar de alta.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
