"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { linesTotal, QUALITY_LABEL, type Quality, type QuoteDetail } from "./quotes";
import styles from "./Quotes.module.css";

interface DraftLine {
  key: number;
  serviceId: string | null;
  description: string;
  quality: Quality | null;
  unitPrice: number | null;
}

/** GET /api/services/rates: what the line search offers. */
interface Rate {
  id: string;
  name: string;
  price: string;
  quality: Quality | null;
  model: { name: string; brand: string | null } | null;
}

const RATE_DELAY_MS = 250;
let nextKey = 1;
const line = (l: Omit<DraftLine, "key">): DraftLine => ({ key: nextKey++, ...l });

/** Finds a rate by repair and model and adds it as a line at its current price. */
function RateSearch({ onPick }: { onPick: (rate: Rate) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Rate[]>([]);
  const typed = q.trim();

  useEffect(() => {
    if (typed.length < 2) {
      setFound([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch(`${API_URL}/services/rates?q=${encodeURIComponent(typed)}`, { signal: controller.signal })
        .then(async (res) => (res.ok ? setFound((await res.json()) as Rate[]) : setFound([])))
        .catch(() => undefined);
    }, RATE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed]);

  return (
    <div className={styles.rateSearch}>
      <TextField
        label="Añadir tarifa"
        type="search"
        autoComplete="off"
        placeholder="batería a54, pantalla 12 pro…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {found.length > 0 && (
        <ul className={styles.rates} aria-label="Tarifas encontradas">
          {found.slice(0, 8).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.rate}
                onClick={() => {
                  onPick(r);
                  setQ("");
                }}
              >
                <span>
                  {r.name}
                  {r.quality && <span className={styles.muted}> · {QUALITY_LABEL[r.quality]}</span>}
                </span>
                <strong>{formatEur(r.price)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Design 2.4: a new quote, or a draft being changed. Name and phone are
 * enough for the client; the lines come from Tarifas or are written by hand.
 */
export function QuoteForm({
  quote,
  onSaved,
  onCancel,
}: {
  quote?: QuoteDetail;
  onSaved: (q: QuoteDetail) => void;
  onCancel: () => void;
}) {
  const [clientName, setClientName] = useState(quote?.clientName ?? "");
  const [clientPhone, setClientPhone] = useState(quote?.clientPhone ?? "");
  const [brand, setBrand] = useState(quote?.brand ?? "");
  const [model, setModel] = useState(quote?.model ?? "");
  const [fault, setFault] = useState(quote?.fault ?? "");
  const [fee, setFee] = useState<number | null>(quote?.diagnosticFee ? Number(quote.diagnosticFee) : null);
  const [lines, setLines] = useState<DraftLine[]>(
    () => quote?.lines.map((l) => line({ ...l, unitPrice: Number(l.unitPrice) })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const change = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const missing = [
    !clientName.trim() && "el nombre",
    !clientPhone.trim() && "el teléfono",
    !model.trim() && "el modelo",
    lines.length === 0 && "una línea",
    lines.some((l) => !l.description.trim() || l.unitPrice === null) && "concepto e importe en cada línea",
  ].filter(Boolean) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing.length) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(quote ? `${API_URL}/quotes/${quote.id}` : `${API_URL}/quotes`, {
        method: quote ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientPhone,
          brand: brand || null,
          model,
          fault: fault || null,
          diagnosticFee: fee,
          lines: lines.map(({ serviceId, description, quality, unitPrice }) => ({
            serviceId,
            description,
            quality,
            unitPrice,
          })),
        }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar."));
        return;
      }
      onSaved((await res.json()) as QuoteDetail);
    } catch {
      setProblem("Comprueba la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} aria-label={quote ? `Editar ${quote.code}` : "Nuevo presupuesto"}>
      <h2 className={styles.formTitle}>{quote ? `Editar ${quote.code}` : "Nuevo presupuesto"}</h2>
      <fieldset className={styles.fields}>
        <legend>
          Cliente <span className={styles.muted}>· basta nombre y teléfono</span>
        </legend>
        <TextField label="Nombre" required value={clientName} onChange={(e) => setClientName(e.target.value)} />
        <TextField label="Teléfono" required type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
      </fieldset>
      <fieldset className={styles.fields}>
        <legend>Dispositivo</legend>
        <TextField label="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} />
        <TextField label="Modelo" required value={model} onChange={(e) => setModel(e.target.value)} />
        <TextField label="Avería" className={styles.wide} value={fault} onChange={(e) => setFault(e.target.value)} />
      </fieldset>

      <fieldset className={styles.linesBox}>
        <legend>Líneas</legend>
        <RateSearch
          onPick={(r) =>
            setLines((ls) => [
              ...ls,
              line({ serviceId: r.id, description: r.name, quality: r.quality, unitPrice: Number(r.price) }),
            ])
          }
        />
        {lines.map((l, i) => (
          <div key={l.key} className={styles.lineRow}>
            <TextField
              label={`Concepto ${i + 1}`}
              value={l.description}
              onChange={(e) => change(l.key, { description: e.target.value })}
            />
            <label className={styles.select}>
              <span>Calidad</span>
              <select
                value={l.quality ?? ""}
                onChange={(e) => change(l.key, { quality: (e.target.value || null) as Quality | null })}
              >
                <option value="">—</option>
                <option value="compatible">Compatible</option>
                <option value="original">Original</option>
              </select>
            </label>
            <MoneyInput label={`Importe ${i + 1}`} value={l.unitPrice} onChange={(v) => change(l.key, { unitPrice: v })} />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Quitar ${l.description || `línea ${i + 1}`}`}
              icon={<Trash2 size={16} aria-hidden />}
              onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
            />
          </div>
        ))}
        <p>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => setLines((ls) => [...ls, line({ serviceId: null, description: "", quality: null, unitPrice: null })])}
          >
            Línea libre
          </Button>
        </p>
        <p className={styles.totalRow}>
          <span>Total</span>
          <strong aria-label="Total del presupuesto">{formatEur(linesTotal(lines))}</strong>
        </p>
      </fieldset>

      <MoneyInput
        label="Diagnóstico si no acepta"
        hint="Se cobra si el cliente dice que no. Déjalo vacío si no se cobra."
        value={fee}
        onChange={setFee}
      />

      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      <p className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          loadingText="Guardando…"
          disabledReason={missing.length ? `Falta ${missing.join(", ")}` : undefined}
        >
          {quote ? "Guardar cambios" : "Crear borrador"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </p>
    </form>
  );
}
