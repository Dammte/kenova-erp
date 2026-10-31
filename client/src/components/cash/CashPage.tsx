"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  KIND_LABEL,
  METHOD_LABEL,
  countDifferences,
  dayChip,
  lineTime,
  matches,
  offHoursNote,
  shiftDate,
  type CashDay,
  type CashMethod,
  type Filter,
} from "./cash";
import styles from "./Cash.module.css";

interface StoreOption {
  id: string;
  name: string;
  isActive?: boolean;
}

const METHODS: CashMethod[] = ["cash", "card", "transfer", "other"];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "charge", label: "Cobros" },
  { id: "refund", label: "Devoluciones" },
  { id: "manual", label: "Entradas y salidas" },
];

/**
 * Design 3.2 «Movimientos de dinero»: the money that came in and went out of
 * a store's till, per cash day. A record, not a till audit: the store's cash
 * hours open and close the day, and the count is optional.
 */
export function CashPage() {
  const { user } = useAuth();
  const isPartner = user?.role === "SUPER_ADMIN";
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [data, setData] = useState<CashDay | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isPartner) return;
    apiFetch(`${API_URL}/stores`)
      .then(async (res) => (res.ok ? ((await res.json()) as StoreOption[]) : []))
      .then((list) => setStores(list.filter((s) => s.isActive !== false)))
      .catch(() => undefined);
  }, [isPartner]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const qs = new URLSearchParams();
    if (storeId) qs.set("storeId", storeId);
    if (date) qs.set("date", date);
    apiFetch(`${API_URL}/cash/day${qs.size ? `?${qs}` : ""}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const day = (await res.json()) as CashDay;
        if (!live) return;
        setData(day);
        if (day.status === "open") setToday(day.date);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [storeId, date, attempt]);

  const reload = (message: string) => {
    setNotice(message);
    setAttempt((n) => n + 1);
  };
  const days = today ? [0, 1, 2, 3].map((n) => shiftDate(today, n)) : [];
  const shown = data?.movements.filter((m) => matches(m, filter)) ?? [];
  const count = (f: Filter) => data?.movements.filter((m) => matches(m, f)).length ?? 0;
  const open = data?.status === "open";

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <h1 className={styles.title}>Movimientos de dinero</h1>
          {data && (
            <p className={styles.muted}>
              {data.store.name} · horario de caja {data.store.opensAt}–{data.store.closesAt}
            </p>
          )}
        </div>
        {isPartner && stores.length > 1 && (
          <label className={styles.store}>
            Tienda
            <select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setDate(null);
              }}
            >
              <option value="">Principal</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {today && (
        <nav className={styles.days} aria-label="Día de caja">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              className={styles.day}
              aria-pressed={(data?.date ?? today) === d}
              onClick={() => setDate(d === today ? null : d)}
            >
              {dayChip(d, today)}
            </button>
          ))}
          <label className={styles.other}>
            Otra fecha
            <input
              type="date"
              max={today}
              value={date && !days.includes(date) ? date : ""}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </label>
        </nav>
      )}

      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {failed && (
        <div role="alert" className={styles.error}>
          No se han podido cargar los movimientos{date ? ` del ${dayChip(date, "").slice(4)}` : ""}. Comprueba la conexión.{" "}
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}
      {!data && !failed && <p className={styles.muted}>Cargando…</p>}

      {data && (
        <>
          <p className={open ? styles.chipOpen : styles.chipClosed}>
            {open
              ? `En curso · se cierra sola a las ${data.store.closesAt}. Los cobros posteriores irán al siguiente día.`
              : data.movements.length === 0
                ? "Este día no hubo cobros ni movimientos. El fondo pasa igual al día siguiente."
                : `Cerrado automáticamente a las ${data.store.closesAt} · ${data.count ? "con recuento" : "sin recuento"}`}
          </p>

          <section className={styles.tiles} aria-label="Cobrado por forma de pago">
            {METHODS.map((m) => (
              <div key={m} className={styles.tile}>
                <p className={styles.muted}>{METHOD_LABEL[m]}</p>
                <p className={styles.amount}>{formatEur(data.byMethod[m].amount)}</p>
                <p className={styles.muted}>
                  {data.byMethod[m].count} {data.byMethod[m].count === 1 ? "movimiento" : "movimientos"}
                </p>
              </div>
            ))}
            <div className={`${styles.tile} ${styles.total}`}>
              <p className={styles.muted}>Total cobrado</p>
              <p className={styles.amount}>{formatEur(data.total)}</p>
              <p className={styles.muted}>neto de devoluciones</p>
            </div>
          </section>

          <div className={styles.columns}>
            <section className={styles.card} aria-label="Movimientos">
              <div className={styles.filters} role="tablist">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.id}
                    className={styles.filter}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label} · {count(f.id)}
                  </button>
                ))}
              </div>
              {shown.length === 0 ? (
                <p className={styles.muted}>Nada que mostrar.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Tipo</th>
                      <th>Concepto</th>
                      <th>Forma</th>
                      <th>Usuario</th>
                      <th className={styles.num}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((m) => (
                      <tr key={m.id}>
                        <td>{lineTime(m, data.date)}</td>
                        <td>{KIND_LABEL[m.kind]}</td>
                        <td>
                          {m.orderId ? (
                            <Link href={`/ordenes?orden=${m.orderId}`}>
                              {m.orderCode} · {m.clientName}
                            </Link>
                          ) : (
                            m.note
                          )}
                          {m.orderId && m.note && <span className={styles.muted}> · {m.note}</span>}
                          {m.offHours && <span className={styles.offHours}>{offHoursNote(m)}</span>}
                        </td>
                        <td>{METHOD_LABEL[m.method]}</td>
                        <td>{m.userName ?? "—"}</td>
                        <td className={`${styles.num} ${Number(m.amount) < 0 ? styles.negative : ""}`}>
                          {m.kind === "in" ? "+" : ""}
                          {formatEur(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <aside className={styles.side}>
              <section className={styles.card} aria-labelledby="cash-box">
                <h2 id="cash-box" className={styles.cardTitle}>
                  Efectivo
                </h2>
                <dl className={styles.sums}>
                  <Sum label="Fondo del día" value={data.cash.float} />
                  <Sum label="Cobros en efectivo" value={data.cash.charges} sign />
                  <Sum label="Devoluciones en efectivo" value={data.cash.refunds} sign />
                  <Sum label="Entradas y salidas" value={data.cash.manual} sign />
                  <Sum label="Esperado" value={data.cash.expected} strong />
                </dl>
                <p className={styles.muted}>
                  {data.count?.cash != null
                    ? `Fondo del día siguiente: ${formatEur(data.count.cash)}, lo contado.`
                    : `Fondo = efectivo esperado del día anterior, o lo contado si hubo recuento.`}
                </p>
              </section>

              {(open || data.count) && (
                <CountForm day={data} storeId={storeId} editable={open} onSaved={reload} />
              )}
              {open && <MovementForm storeId={storeId} onSaved={reload} />}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function Sum({ label, value, sign, strong }: { label: string; value: string; sign?: boolean; strong?: boolean }) {
  return (
    <div className={strong ? styles.strong : undefined}>
      <dt>{label}</dt>
      <dd>
        {sign && Number(value) > 0 ? "+" : ""}
        {formatEur(value)}
      </dd>
    </div>
  );
}

function CountForm({
  day,
  storeId,
  editable,
  onSaved,
}: {
  day: CashDay;
  storeId: string;
  editable: boolean;
  onSaved: (message: string) => void;
}) {
  const [cash, setCash] = useState<number | null>(day.count?.cash != null ? Number(day.count.cash) : null);
  const [terminal, setTerminal] = useState<number | null>(day.count?.terminal != null ? Number(day.count.terminal) : null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const differences = countDifferences(day);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/cash/count`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: storeId || undefined, cash, terminal }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar el recuento."));
        return;
      }
      onSaved("Recuento guardado");
    } catch {
      setProblem("No se ha podido guardar el recuento: se ha perdido la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.card} onSubmit={save} aria-labelledby="count-title">
      <h2 id="count-title" className={styles.cardTitle}>
        Recuento <span className={styles.muted}>opcional</span>
      </h2>
      {editable ? (
        <>
          <MoneyInput label="Efectivo contado" value={cash} onChange={setCash} />
          <MoneyInput label="Total del datáfono" value={terminal} onChange={setTerminal} />
        </>
      ) : (
        <p>
          {day.count?.cash != null && `Efectivo contado ${formatEur(day.count.cash)}. `}
          {day.count?.terminal != null && `Datáfono ${formatEur(day.count.terminal)}.`}
        </p>
      )}
      {differences.map((d) => (
        <p key={d} className={styles.muted}>
          {d}
        </p>
      ))}
      {day.count?.countedBy && <p className={styles.muted}>Contado por {day.count.countedBy}</p>}
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      {editable && (
        <Button
          type="submit"
          loading={saving}
          disabledReason={cash === null && terminal === null ? "Escribe lo contado" : undefined}
        >
          Guardar recuento
        </Button>
      )}
    </form>
  );
}

function MovementForm({ storeId, onSaved }: { storeId: string; onSaved: (message: string) => void }) {
  const [kind, setKind] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = amount !== null && amount > 0 && reason.trim() !== "";

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/cash/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: storeId || undefined, kind, amount, reason: reason.trim() }),
      });
      if (!res.ok) {
        // Amount and reason stay, so nothing has to be typed again.
        setProblem(await errorMessage(res, "No se ha podido anotar."));
        return;
      }
      onSaved(`${kind === "in" ? "Entrada" : "Salida"} de ${formatEur(amount)} anotada`);
      setAmount(null);
      setReason("");
    } catch {
      setProblem("No se ha podido anotar: se ha perdido la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.card} onSubmit={save} aria-labelledby="move-title">
      <h2 id="move-title" className={styles.cardTitle}>
        Entrada o salida
      </h2>
      <div className={styles.segment} role="radiogroup" aria-label="Tipo">
        {(["in", "out"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
            {k === "in" ? "Entrada" : "Salida"}
          </button>
        ))}
      </div>
      <MoneyInput label="Importe" value={amount} onChange={setAmount} />
      <TextField label="Motivo" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      <Button type="submit" variant="primary" loading={saving} disabledReason={ready ? undefined : "Escribe importe y motivo"}>
        Anotar {kind === "in" ? "entrada" : "salida"}
      </Button>
    </form>
  );
}
