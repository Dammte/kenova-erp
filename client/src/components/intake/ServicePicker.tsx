"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Button, MoneyInput } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { METHODS } from "@/components/orders/ChargeForm";
import { orderTotal, servicesSum, type IntakeState, type PricedService } from "./intake";
import styles from "./Intake.module.css";

/** Matches shown under the search. */
const SHOWN = 6;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * The price list entries that match what was typed. With a device model, its
 * own services come first, and are suggested before typing (design 1.3, note 4).
 */
export function matchServices(all: PricedService[], query: string, model: string, chosen: string[]): PricedService[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const m = fold(model.trim());
  const pool = all.filter((x) => !chosen.includes(x.id) && words.every((w) => fold(x.name).includes(w)));
  if (!m) return pool.slice(0, SHOWN);
  const forModel = (x: PricedService) => fold(x.name).includes(m);
  // Before typing, only the model's own services are suggested.
  const rest = words.length ? pool.filter((x) => !forModel(x)) : [];
  return [...pool.filter(forModel), ...rest].slice(0, SHOWN);
}

type Money = Pick<IntakeState, "services" | "total" | "deposit" | "method">;

/** Block "Servicios y precio": what will be done, the total and the deposit. */
export function ServicePicker({
  value,
  model,
  onChange,
}: {
  value: Money;
  /** The device model, to put its services first. */
  model: string;
  onChange: (patch: Partial<Money>) => void;
}) {
  const [all, setAll] = useState<PricedService[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/services?available=true`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setAll((await res.json()) as PricedService[]);
      })
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, []);

  const chosen = value.services.map((x) => x.id);
  const typed = query.trim();
  const matches = useMemo(
    () => (all && (typed || model.trim()) ? matchServices(all, typed, model, chosen) : []),
    // chosen is derived from value.services on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, typed, model, value.services],
  );

  const add = (x: PricedService) => {
    onChange({ services: [...value.services, x] });
    setQuery("");
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (typed && matches[0]) add(matches[0]);
    }
  };

  const sum = servicesSum(value.services);
  const total = orderTotal(value);
  const pending = Math.max(0, total - (value.deposit ?? 0));

  return (
    <>
      {value.services.length > 0 ? (
        <ul className={styles.lines}>
          {value.services.map((x) => (
            <li key={x.id}>
              <span>{x.name}</span>
              <span className={styles.lineEnd}>
                {formatEur(Number(x.price))}
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Quitar ${x.name}`}
                  onClick={() => onChange({ services: value.services.filter((y) => y.id !== x.id) })}
                >
                  <X size={16} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Sin servicios todavía. Puedes crear la orden solo con diagnóstico y presupuestar después.</p>
      )}

      {failed ? (
        <p className={styles.error}>No se han podido cargar las tarifas. Puedes poner el total a mano.</p>
      ) : (
        <div className={styles.group}>
          <label className={styles.label} htmlFor="intake-service">
            Añadir servicio o tarifa <span className={styles.muted}>· Intro añade el primero</span>
          </label>
          <input
            id="intake-service"
            name="service-search"
            className={styles.input}
            autoComplete="off"
            placeholder={all ? "Pantalla, batería, diagnóstico…" : "Cargando tarifas…"}
            disabled={!all}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          {matches.length > 0 && (
            <div className={styles.chips}>
              {matches.map((x) => (
                <button key={x.id} type="button" className={styles.chip} onClick={() => add(x)}>
                  {x.name} · {formatEur(Number(x.price))}
                </button>
              ))}
            </div>
          )}
          {typed && all && matches.length === 0 && (
            <p className={styles.muted}>Ninguna tarifa coincide con «{typed}». Puedes poner el precio en el total.</p>
          )}
        </div>
      )}

      <div className={styles.grid2}>
        <div className={styles.group}>
          <MoneyInput
            name="total"
            label="Total acordado"
            hint={value.total === null ? "La suma de los servicios." : `La suma de los servicios es ${formatEur(sum)}.`}
            value={total}
            onChange={(v) => onChange({ total: v === null || v === sum ? null : v })}
          />
          {value.total !== null && value.services.length > 0 && (
            <p className={styles.full}>
              <Button size="sm" variant="ghost" onClick={() => onChange({ total: null })}>
                Usar la suma
              </Button>
            </p>
          )}
        </div>
        <MoneyInput
          name="deposit"
          label="A cuenta · opcional"
          error={value.deposit && value.deposit > total ? `A cuenta no puede superar el total (${formatEur(total)}).` : undefined}
          value={value.deposit}
          onChange={(v) => onChange({ deposit: v || null, ...(v ? {} : { method: null }) })}
        />
      </div>

      {Boolean(value.deposit) && (
        <fieldset className={styles.group} data-field="method">
          <legend className={styles.label}>Forma de pago</legend>
          <div className={styles.chips}>
            {METHODS.map(([m, text]) => (
              <label key={m} className={styles.chip}>
                <input type="radio" name="deposit-method" checked={value.method === m} onChange={() => onChange({ method: m })} />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <p className={styles.totals}>
        <span>
          Total <strong>{formatEur(total)}</strong>
        </span>
        <span>
          A cuenta <strong>{formatEur(Math.min(value.deposit ?? 0, total))}</strong>
        </span>
        <span>
          Pendiente <strong>{formatEur(pending)}</strong>
        </span>
      </p>
    </>
  );
}
