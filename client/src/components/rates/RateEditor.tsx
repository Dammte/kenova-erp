"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import styles from "./Rates.module.css";

type Quality = "compatible" | "original" | null;

/** GET /api/services/:id, the fields the editor changes. */
interface ServiceDetail {
  id: string;
  name: string;
  category: string | null;
  price: string;
  estimatedTime: string | null;
  modelId: string | null;
  quality: Quality;
  inventoryId: string | null;
}
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

/** Models as "Samsung Galaxy A54", sorted, for the select. */
export function modelOptions(
  models: { id: string; name: string; brandId?: string | null }[],
  brands: { id: string; name: string }[],
): Option[] {
  const brand = new Map(brands.map((b) => [b.id, b.name]));
  return models
    .map((m) => ({ id: m.id, label: [m.brandId ? brand.get(m.brandId) : null, m.name].filter(Boolean).join(" ") }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/**
 * Partners only: the price, time, model, quality and part of one rate, so the
 * price list can group it by model and say whether the part is in stock.
 */
export function RateEditor({ id, onSaved, onCancel }: { id: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<ServiceDetail | null>(null);
  const [models, setModels] = useState<Option[]>([]);
  const [parts, setParts] = useState<Option[]>([]);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      getJson<ServiceDetail>(`${API_URL}/services/${id}`),
      getJson<{ id: string; name: string; brandId?: string | null }[]>(`${API_URL}/models`),
      getJson<{ id: string; name: string }[]>(`${API_URL}/brands`),
      getJson<{ id: string; sku: string; name: string }[]>(`${API_URL}/inventory`).catch(() => []),
    ])
      .then(([service, m, b, inv]) => {
        if (!live) return;
        setForm(service);
        setModels(modelOptions(m, b));
        setParts(inv.map((p) => ({ id: p.id, label: `${p.name} · ${p.sku}` })).sort((x, y) => x.label.localeCompare(y.label, "es")));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);

  if (failed) return <p className={styles.error}>No se ha podido abrir la tarifa para editarla.</p>;
  if (!form) return <p className={styles.muted}>Cargando la tarifa…</p>;

  const set = (patch: Partial<ServiceDetail>) => setForm({ ...form, ...patch });
  const price = Number(form.price);
  const missing = !form.name.trim() ? "Falta el nombre." : !(price >= 0) ? "Falta el precio." : null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (missing || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category?.trim() || undefined,
          price,
          estimatedTime: form.estimatedTime?.trim() || undefined,
          modelId: form.modelId,
          quality: form.quality,
          inventoryId: form.inventoryId,
        }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar la tarifa."));
        return;
      }
      onSaved();
    } catch {
      setProblem("No se ha podido guardar la tarifa. Comprueba la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.editor} onSubmit={save} aria-label={`Editar ${form.name}`}>
      <div className={styles.editorGrid}>
        <TextField label="Nombre" value={form.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} />
        <TextField
          label="Reparación"
          hint="Agrupa la tarifa en Tarifas, p. ej. «Cambio de pantalla»."
          value={form.category ?? ""}
          maxLength={50}
          onChange={(e) => set({ category: e.target.value })}
        />
        <MoneyInput label="Precio" value={Number.isFinite(price) ? price : null} onChange={(v) => set({ price: String(v ?? "") })} />
        <TextField
          label="Tiempo estimado"
          value={form.estimatedTime ?? ""}
          maxLength={50}
          placeholder="1-2 h"
          onChange={(e) => set({ estimatedTime: e.target.value })}
        />
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Modelo</span>
          <select
            className={styles.select}
            value={form.modelId ?? ""}
            onChange={(e) => set({ modelId: e.target.value || null })}
          >
            <option value="">General (sin modelo)</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Pieza de inventario</span>
          <select
            className={styles.select}
            value={form.inventoryId ?? ""}
            onChange={(e) => set({ inventoryId: e.target.value || null })}
          >
            <option value="">Ninguna</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className={styles.qualities}>
        <legend className={styles.fieldLabel}>Calidad de la pieza</legend>
        <div className={styles.chips}>
          {QUALITIES.map(([q, label]) => (
            <label key={label} className={styles.chip}>
              <input type="radio" name={`quality-${id}`} checked={form.quality === q} onChange={() => set({ quality: q })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.copyRow}>
        <Button type="submit" variant="primary" size="sm" loading={saving} loadingText="Guardando…" disabledReason={missing ?? undefined}>
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </p>
    </form>
  );
}
