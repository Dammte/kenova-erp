"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button, TextField } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { DEVICE_TYPE_LABEL } from "@/components/orders/orderDetail";
import PatternLock from "@/components/serviceOrders/PatternLock";
import { DEVICE_TYPES, EMPTY_DEVICE, UNLOCKS, cleanImei, isKnown, type KnownDevice, type NewDevice } from "./intake";
import { ModelMatch, type KnownBrand, type KnownModel } from "./modelMatch";
import styles from "./Intake.module.css";

/** Previous devices shown as one-tap chips; the newest first. */
const SHOWN = 4;

/** "159" or "1 5 9" typed by hand become the stored "1-5-9". */
export const dashDots = (s: string) => s.replace(/[^1-9]/g, "").split("").slice(0, 9).join("-");

const shortDate = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Block 2 of the intake. A returning client's devices come first: one tap
 * fills the device and moves on to the fault (design 1.3, interaction 2).
 */
export function DevicePicker({
  clientId,
  value,
  onChange,
}: {
  /** The chosen client, when it already exists. */
  clientId: string | null;
  value: KnownDevice | NewDevice | null;
  onChange: (device: KnownDevice | NewDevice | null) => void;
}) {
  const [devices, setDevices] = useState<KnownDevice[]>([]);
  const [catalog, setCatalog] = useState<{ brands: KnownBrand[]; models: KnownModel[] }>({ brands: [], models: [] });
  const listId = useId();

  // The catalogue's brands and models, to suggest names and the device type.
  useEffect(() => {
    let live = true;
    const read = <T,>(url: string) =>
      apiFetch(url)
        .then(async (res) => (res.ok ? ((await res.json()) as T[]) : []))
        .catch(() => [] as T[]);
    Promise.all([read<KnownBrand>(`${API_URL}/brands`), read<KnownModel>(`${API_URL}/models`)]).then(([brands, models]) => {
      if (live) setCatalog({ brands, models });
    });
    return () => {
      live = false;
    };
  }, []);
  const match = useMemo(() => new ModelMatch(catalog.brands, catalog.models), [catalog]);

  useEffect(() => {
    setDevices([]);
    if (!clientId) return;
    const controller = new AbortController();
    apiFetch(`${API_URL}/devices/client/${clientId}`, { signal: controller.signal })
      .then(async (res) => (res.ok ? ((await res.json()) as KnownDevice[]) : []))
      .catch(() => [])
      .then((list) => {
        if (controller.signal.aborted) return;
        const recent = [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        setDevices(recent);
        // A new client, or one without devices, goes straight to the form,
        // unless a device is already filled in (from a quote).
        if (recent.length === 0 && !value) onChange(EMPTY_DEVICE);
      });
    return () => controller.abort();
    // onChange changes on every render of the form; only the client matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const chips = devices.length > 0 && (
    <div className={styles.chips}>
      {devices.slice(0, SHOWN).map((d) => (
        <button
          key={d.id}
          type="button"
          className={styles.chip}
          aria-pressed={isKnown<KnownDevice>(value) && value.id === d.id}
          onClick={() => {
            onChange(d);
            // Interaction 2: the fault comes next.
            document.querySelector<HTMLElement>('[data-field="faults"] input')?.focus();
          }}
        >
          <strong>
            {d.brand} {d.model}
          </strong>
          <span className={styles.muted}>
            {[d.imei && `…${d.imei.slice(-6)}`, shortDate.format(new Date(d.createdAt))].filter(Boolean).join(" · ")}
          </span>
        </button>
      ))}
      <button
        type="button"
        className={styles.chip}
        aria-pressed={value !== null && !isKnown(value)}
        onClick={() => onChange(EMPTY_DEVICE)}
      >
        Otro dispositivo
      </button>
    </div>
  );

  if (!value || isKnown<KnownDevice>(value)) {
    return (
      <>
        {chips}
        {value && (
          <p className={styles.muted}>
            {[DEVICE_TYPE_LABEL[value.type] ?? value.type, `${value.brand} ${value.model}`, value.imei && `IMEI ${value.imei}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {!clientId && !value && <p className={styles.muted}>Elige primero el cliente.</p>}
      </>
    );
  }

  const set = (patch: Partial<NewDevice>) => {
    const next = { ...value, ...patch };
    // Design R2 3.8: a known model proposes its device type.
    if ("brand" in patch || "model" in patch) {
      const type = match.typeOf(next.brand, next.model);
      if (type) next.type = type;
    }
    onChange(next);
  };
  const brandHint = match.brandLookalike(value.brand);
  const modelHint = match.modelLookalike(value.brand, value.model);
  return (
    <>
      {chips}
      <fieldset className={styles.group}>
        <legend className={styles.label}>Tipo</legend>
        <div className={styles.chips}>
          {DEVICE_TYPES.map(([type, label]) => (
            <label key={type} className={styles.chip}>
              <input type="radio" name="device-type" checked={value.type === type} onChange={() => set({ type })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.grid2}>
        <div>
          <TextField
            name="device-brand"
            label="Marca"
            required
            list={`${listId}-brands`}
            value={value.brand}
            onChange={(e) => set({ brand: e.target.value })}
          />
          <datalist id={`${listId}-brands`}>
            {match.brandNames().map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {brandHint && (
            <p className={styles.muted}>
              Ya existe «{brandHint}».{" "}
              <button type="button" className={styles.linkButton} onClick={() => set({ brand: brandHint })}>
                Usar «{brandHint}»
              </button>
            </p>
          )}
        </div>
        <div>
          <TextField
            name="device-model"
            label="Modelo"
            required
            list={`${listId}-models`}
            value={value.model}
            onChange={(e) => set({ model: e.target.value })}
          />
          <datalist id={`${listId}-models`}>
            {match.modelNames(value.brand).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {modelHint && (
            <p className={styles.muted}>
              Ya existe «{modelHint}».{" "}
              <button type="button" className={styles.linkButton} onClick={() => set({ model: modelHint })}>
                Usar «{modelHint}»
              </button>
            </p>
          )}
        </div>
        <TextField
          label="IMEI / nº de serie · opcional"
          hint="Marca *#06# en el móvil para verlo."
          autoComplete="off"
          value={value.imei}
          onChange={(e) => set({ imei: cleanImei(e.target.value) })}
        />
      </div>
      <fieldset className={styles.group}>
        <legend className={styles.label}>
          Desbloqueo <span className={styles.muted}>· se guarda cifrado</span>
        </legend>
        <div className={styles.chips}>
          {UNLOCKS.map(([u, label]) => (
            <label key={u} className={styles.chip}>
              <input type="radio" name="device-unlock" checked={value.unlock === u} onChange={() => set({ unlock: u })} />
              {label}
            </label>
          ))}
        </div>
        {value.unlock === "code" && (
          <TextField
            name="device-code"
            label="PIN o contraseña"
            autoComplete="off"
            maxLength={64}
            value={value.code}
            onChange={(e) => set({ code: e.target.value })}
          />
        )}
        {value.unlock === "pattern" && (
          <div className={styles.pattern}>
            <PatternLock value={value.pattern} onChange={(pattern) => set({ pattern })} />
            <TextField
              name="device-pattern"
              label="O escribe los puntos"
              hint="Del 1 al 9, de izquierda a derecha y de arriba abajo: 1-5-9-6."
              autoComplete="off"
              inputMode="numeric"
              value={value.pattern}
              onChange={(e) => set({ pattern: dashDots(e.target.value) })}
            />
          </div>
        )}
      </fieldset>
      {devices.length > 0 && (
        <p>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Elegir un dispositivo anterior
          </Button>
        </p>
      )}
    </>
  );
}
