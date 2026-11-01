"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import type { Shipment, ShipmentCandidate } from "./shipments";
import styles from "./Shipments.module.css";

interface Props {
  /** Partners choose the store the devices go back to; a store always ships to Medina. */
  partner: boolean;
  onCreated: (id: string) => void;
  onCancel: () => void;
}

interface StoreOption {
  id: string;
  name: string;
  isMain: boolean;
  isActive: boolean;
}

/**
 * Design R2 3.14 «Envío por lotes»: tick the devices, create the shipment,
 * then print its sheet. Without devices «Crear envío» stays disabled.
 */
export function NewShipment({ partner, onCreated, onCancel }: Props) {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [toStoreId, setToStoreId] = useState("");
  const [candidates, setCandidates] = useState<ShipmentCandidate[] | null>(
    null,
  );
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [carrier, setCarrier] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!partner) return;
    let live = true;
    apiFetch(`${API_URL}/stores`)
      .then(async (res) => {
        if (!res.ok) return;
        const all = (await res.json()) as StoreOption[];
        const partners = all.filter((s) => !s.isMain && s.isActive);
        if (!live) return;
        setStores(partners);
        // With one partner store there is nothing to choose.
        if (partners.length === 1) setToStoreId(partners[0].id);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [partner]);

  const ready = !partner || toStoreId !== "";
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setCandidates(null);
    setLoadProblem(null);
    setPicked(new Set());
    const query = partner ? `?toStoreId=${toStoreId}` : "";
    apiFetch(`${API_URL}/shipments/candidates${query}`)
      .then(async (res) => {
        if (!res.ok) {
          const message = await errorMessage(
            res,
            "No se han podido cargar los equipos.",
          );
          if (live) setLoadProblem(message);
          return;
        }
        const list = (await res.json()) as ShipmentCandidate[];
        if (live) setCandidates(list);
      })
      .catch(
        () => live && setLoadProblem("No se han podido cargar los equipos."),
      );
    return () => {
      live = false;
    };
  }, [ready, partner, toStoreId]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all =
    candidates !== null &&
    candidates.length > 0 &&
    picked.size === candidates.length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (picked.size === 0) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/shipments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [...picked],
          ...(partner ? { toStoreId } : {}),
          ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido crear el envío."));
        return;
      }
      onCreated(((await res.json()) as Shipment).id);
    } catch {
      setProblem("No se ha podido crear el envío. Comprueba la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const destination = partner
    ? (stores.find((s) => s.id === toStoreId)?.name ?? "la tienda")
    : "Medina";

  return (
    <section className={styles.card} aria-label="Nuevo envío">
      <header className={styles.cardTitle}>
        <h2 className={styles.cardHeading}>
          {partner ? "Envío a tienda" : "Nuevo envío a Medina"}
        </h2>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Cancelar envío"
          onClick={onCancel}
        >
          ×
        </button>
      </header>

      <form onSubmit={submit} className={styles.newForm}>
        {partner && (
          <label className={styles.field}>
            <span>Tienda a la que vuelve</span>
            <select
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
              className={styles.select}
            >
              <option value="">Elige la tienda…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {!ready ? null : loadProblem ? (
          <p className={styles.error} role="alert">
            {loadProblem}
          </p>
        ) : candidates === null ? (
          <p className={styles.sub}>Cargando equipos…</p>
        ) : candidates.length === 0 ? (
          <div className={styles.empty}>
            <p>
              {partner
                ? `No hay equipos de ${destination} en Medina para devolver.`
                : "No hay equipos en la tienda pendientes de enviar a Medina."}
            </p>
          </div>
        ) : (
          <fieldset className={styles.pickList}>
            <legend className={styles.sub}>
              {picked.size} de {candidates.length} equipos marcados
            </legend>
            <label className={styles.pickAll}>
              <input
                type="checkbox"
                checked={all}
                onChange={() =>
                  setPicked(
                    all ? new Set() : new Set(candidates.map((c) => c.orderId)),
                  )
                }
              />
              Marcar todos
            </label>
            {candidates.map((c) => (
              <label key={c.orderId} className={styles.pick}>
                <input
                  type="checkbox"
                  checked={picked.has(c.orderId)}
                  onChange={() => toggle(c.orderId)}
                />
                <span className={styles.code}>{c.orderCode}</span>
                <span>{c.clientName || "—"}</span>
                <span className={styles.sub}>
                  {c.device ?? "—"}
                  {c.accessories ? ` · ${c.accessories}` : ""}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <TextField
          label="Transportista (opcional)"
          value={carrier}
          maxLength={80}
          onChange={(e) => setCarrier(e.target.value)}
        />

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={saving}
            disabledReason={
              picked.size === 0 ? "Añade al menos un equipo" : undefined
            }
          >
            Crear envío
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
        {problem && (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}
      </form>
    </section>
  );
}
