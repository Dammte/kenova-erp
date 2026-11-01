"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { modelOptions } from "@/components/rates/RateEditor";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import {
  emptyService,
  serviceBody,
  serviceDraftFrom,
  validateService,
  type Quality,
  type ServiceData,
  type ServiceDraft,
  type ServiceErrors,
} from "./services";
import styles from "./Services.module.css";

interface Option {
  id: string;
  label: string;
}

const QUALITIES: [Quality, string][] = [
  [null, "Sin calidad"],
  ["compatible", "Compatible"],
  ["original", "Original"],
];

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

interface Props {
  /** The service to edit; without it the form creates one. */
  id?: string;
  categories: string[];
  onSaved: (id: string) => void;
  onCancel: () => void;
}

/** Design 3.5: new or edit service in the side card, with model, quality and part (D3). */
export function ServiceForm({ id, categories, onSaved, onCancel }: Props) {
  const [original, setOriginal] = useState<ServiceData | null>(null);
  const [draft, setDraft] = useState<ServiceDraft | null>(id ? null : emptyService());
  const [models, setModels] = useState<Option[]>([]);
  const [parts, setParts] = useState<Option[]>([]);
  const [errors, setErrors] = useState<ServiceErrors>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const uid = useId();

  useEffect(() => {
    let live = true;
    setLoadFailed(false);
    Promise.all([
      id ? getJson<ServiceData>(`${API_URL}/services/${id}`) : Promise.resolve(null),
      getJson<{ id: string; name: string; brandId?: string | null }[]>(`${API_URL}/models`),
      getJson<{ id: string; name: string }[]>(`${API_URL}/brands`),
      getJson<{ id: string; sku: string; name: string }[]>(`${API_URL}/inventory`).catch(() => []),
    ])
      .then(([service, m, b, inv]) => {
        if (!live) return;
        if (service) {
          setOriginal(service);
          setDraft(serviceDraftFrom(service));
        }
        setModels(modelOptions(m, b));
        setParts(
          inv.map((p) => ({ id: p.id, label: `${p.name} · ${p.sku}` })).sort((x, y) => x.label.localeCompare(y.label, "es")),
        );
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const label = id ? "Editar servicio" : "Nuevo servicio";
  if (loadFailed || !draft) {
    return (
      <aside className={styles.card} aria-label={label}>
        {loadFailed ? (
          <p role="alert" className={styles.error}>
            No se ha podido abrir el servicio.{" "}
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

  const set = <K extends keyof ServiceDraft>(k: K, v: ServiceDraft[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const body = serviceBody(draft, original ?? undefined);
  const nothingChanged = Boolean(original) && Object.keys(body).length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateService(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/services${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar el servicio."));
        return;
      }
      onSaved(((await res.json()) as { id: string }).id);
    } catch {
      setProblem("No se ha podido guardar. Comprueba la conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const select = (k: "modelId" | "inventoryId", fieldLabel: string, empty: string, options: Option[]) => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{fieldLabel}</span>
      <select className={styles.select} value={draft[k] ?? ""} onChange={(e) => set(k, e.target.value || null)}>
        <option value="">{empty}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <aside className={styles.card} aria-label={label}>
      <header className={styles.cardHead}>
        <div className={styles.cardTitle}>
          <h2>{original ? original.name : label}</h2>
          {original && <p className={styles.muted}>Editar servicio</p>}
        </div>
        <button type="button" className={styles.close} aria-label="Cerrar sin guardar" onClick={onCancel}>
          <X size={18} aria-hidden />
        </button>
      </header>

      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="Nombre"
          required
          placeholder="Cambio de pantalla"
          value={draft.name}
          error={errors.name}
          onChange={(e) => set("name", e.target.value)}
        />
        <TextField
          label="Descripción"
          placeholder="Pantalla nueva, prueba de táctil y sensores"
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <div className={styles.pair}>
          <TextField
            label="Categoría"
            list={`${uid}-categories`}
            hint="Agrupa la tarifa en Tarifas."
            value={draft.category}
            error={errors.category}
            onChange={(e) => set("category", e.target.value)}
          />
          <datalist id={`${uid}-categories`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <TextField
            label="Tiempo estimado"
            placeholder="1-2 h"
            value={draft.estimatedTime}
            error={errors.estimatedTime}
            onChange={(e) => set("estimatedTime", e.target.value)}
          />
        </div>
        <MoneyInput label="Precio" required value={draft.price} error={errors.price} onChange={(v) => set("price", v)} />
        <div className={styles.pair}>
          {select("modelId", "Modelo", "Todos los modelos", models)}
          {select("inventoryId", "Pieza de inventario", "Ninguna", parts)}
        </div>
        <fieldset className={styles.qualities}>
          <legend className={styles.fieldLabel}>Calidad de la pieza</legend>
          <div className={styles.choices}>
            {QUALITIES.map(([q, text]) => (
              <label key={text} className={styles.choice}>
                <input type="radio" name={`${uid}-quality`} checked={draft.quality === q} onChange={() => set("quality", q)} />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={styles.check}>
          <input type="checkbox" checked={draft.available} onChange={(e) => set("available", e.target.checked)} />
          <span>
            Disponible
            <span className={styles.muted}> · si no, no sale en el alta ni en Tarifas; las órdenes antiguas lo conservan.</span>
          </span>
        </label>

        {problem && (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        )}
        <div className={styles.actions}>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            loadingText="Guardando…"
            disabledReason={nothingChanged ? "No has cambiado nada" : undefined}
          >
            {original ? "Guardar cambios" : "Crear servicio"}
          </Button>
        </div>
      </form>
    </aside>
  );
}
