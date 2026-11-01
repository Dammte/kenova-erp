"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { signed } from "./inventory";
import {
  BASE_CATEGORIES,
  bodyFor,
  draftFrom,
  emptyDraft,
  stockChange,
  suggestSku,
  validate,
  type DraftErrors,
  type PartData,
  type PartDraft,
} from "./partForm";
import styles from "./Inventory.module.css";

/** What the list already knows, offered while typing. */
export interface PartSuggestions {
  categories: string[];
  brands: string[];
  providers: string[];
}

interface Props {
  /** The part to edit; without it the form creates one. */
  id?: string;
  suggestions: PartSuggestions;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

/** Design 3.4: new or edit part, in the side card, without leaving the list. */
export function PartForm({ id, suggestions, onSaved, onCancel }: Props) {
  const [original, setOriginal] = useState<PartData | null>(null);
  const [draft, setDraft] = useState<PartDraft | null>(id ? null : emptyDraft());
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const listId = useId();

  useEffect(() => {
    if (!id) return;
    let live = true;
    setLoadFailed(false);
    apiFetch(`${API_URL}/inventory/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const p = (await res.json()) as PartData;
        if (!live) return;
        setOriginal(p);
        setDraft(draftFrom(p));
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const label = id ? "Editar repuesto" : "Nuevo repuesto";
  if (loadFailed || !draft) {
    return (
      <aside className={styles.card} aria-label={label}>
        {loadFailed ? (
          <p role="alert" className={styles.error}>
            No se ha podido abrir el repuesto.{" "}
            <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
          </p>
        ) : (
          <p className={styles.muted}>Cargando…</p>
        )}
      </aside>
    );
  }

  const set = <K extends keyof PartDraft>(k: K, v: PartDraft[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const body = bodyFor(draft, original ?? undefined);
  const nothingChanged = Boolean(original) && Object.keys(body).length === 0;
  const diff = original ? stockChange(draft, original) : null;
  const categories = [...new Set([...suggestions.categories, ...BASE_CATEGORIES])];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/inventory${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        setErrors({ sku: `Ya hay un repuesto con el SKU ${draft.sku.trim()}.` });
        return;
      }
      if (!res.ok) {
        const msg = ((await res.json().catch(() => ({}))) as { message?: string | string[] }).message;
        setProblem(Array.isArray(msg) ? msg.join(". ") : (msg ?? "No se ha podido guardar. Inténtalo de nuevo."));
        return;
      }
      const saved = (await res.json()) as { id: string };
      onSaved(saved.id);
    } catch {
      setProblem("No se ha podido guardar. Comprueba la conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const textField = (k: "model" | "ubication", fieldLabel: string, placeholder: string) => (
    <TextField
      label={fieldLabel}
      placeholder={placeholder}
      value={draft[k]}
      error={errors[k]}
      onChange={(e) => set(k, e.target.value)}
    />
  );
  const listField = (k: "category" | "brand" | "provider", fieldLabel: string, options: string[]) => (
    <>
      <TextField
        label={fieldLabel}
        list={`${listId}-${k}`}
        value={draft[k]}
        error={errors[k]}
        onChange={(e) => set(k, e.target.value)}
      />
      <datalist id={`${listId}-${k}`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );

  return (
    <aside className={styles.card} aria-label={label}>
      <header className={styles.cardHead}>
        <div className={styles.cardTitle}>
          <h2>{original ? original.name : label}</h2>
          {original && <p className={styles.muted}>Editar repuesto · {original.sku}</p>}
        </div>
        <button type="button" className={styles.close} aria-label="Cerrar sin guardar" onClick={onCancel}>
          <X size={18} aria-hidden />
        </button>
      </header>

      <form className={styles.partForm} onSubmit={submit} noValidate>
        <TextField
          label="Nombre"
          required
          placeholder="Pantalla iPhone 13 OLED"
          value={draft.name}
          error={errors.name}
          onChange={(e) => set("name", e.target.value)}
        />
        <div className={styles.formPair}>
          {listField("category", "Categoría", categories)}
          <TextField
            label="SKU"
            required
            value={draft.sku}
            error={errors.sku}
            hint={original ? undefined : "El código de la etiqueta. Único."}
            onChange={(e) => set("sku", e.target.value.toUpperCase())}
            suffix={
              original ? undefined : (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => set("sku", suggestSku(draft.category, draft.name))}
                >
                  Sugerir
                </button>
              )
            }
          />
        </div>
        <div className={styles.formPair}>
          {listField("brand", "Marca", suggestions.brands)}
          {textField("model", "Compatible con", "iPhone 13, 13 Pro")}
        </div>
        <div className={styles.formPair}>
          {textField("ubication", "Ubicación", "Estante B2")}
          {listField("provider", "Proveedor", suggestions.providers)}
        </div>
        <div className={styles.formPair}>
          <TextField
            label={original ? "Stock" : "Stock inicial"}
            inputMode="numeric"
            value={draft.stock}
            error={errors.stock}
            hint={
              diff !== null
                ? `Se guarda como ajuste de ${signed(diff)} en los movimientos.`
                : original
                  ? "Las compras y las órdenes lo cambian solas."
                  : undefined
            }
            onChange={(e) => set("stock", e.target.value)}
          />
          <TextField
            label="Stock mínimo"
            inputMode="numeric"
            value={draft.minimalStock}
            error={errors.minimalStock}
            hint="Por debajo, sale como stock bajo."
            onChange={(e) => set("minimalStock", e.target.value)}
          />
        </div>
        <div className={styles.formPair}>
          <MoneyInput label="Precio de venta" value={draft.salesPrice} onChange={(v) => set("salesPrice", v)} />
          <MoneyInput
            label="Coste"
            value={draft.costPrice}
            hint={original ? "Las facturas lo recalculan como coste medio." : undefined}
            onChange={(v) => set("costPrice", v)}
          />
        </div>
        <TextField
          label="Notas"
          placeholder="Color, calidad, observaciones"
          value={draft.description}
          error={errors.description}
          onChange={(e) => set("description", e.target.value)}
        />

        {problem && (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        )}
        <div className={styles.formActions}>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            loadingText="Guardando…"
            disabledReason={nothingChanged ? "No has cambiado nada" : undefined}
          >
            {original ? "Guardar cambios" : "Crear repuesto"}
          </Button>
        </div>
      </form>
    </aside>
  );
}
