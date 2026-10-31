"use client";

import { useEffect, useState } from "react";
import { Button, TextField } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { DEVICE_TYPE_LABEL } from "@/components/orders/orderDetail";
import { DEVICE_TYPES, EMPTY_DEVICE, cleanImei, isKnown, type KnownDevice, type NewDevice } from "./intake";
import styles from "./Intake.module.css";

/** Previous devices shown as one-tap chips; the newest first. */
const SHOWN = 4;

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
        // A new client, or one without devices, goes straight to the form.
        if (recent.length === 0) onChange(EMPTY_DEVICE);
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

  const set = (patch: Partial<NewDevice>) => onChange({ ...value, ...patch });
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
        <TextField name="device-brand" label="Marca" required value={value.brand} onChange={(e) => set({ brand: e.target.value })} />
        <TextField name="device-model" label="Modelo" required value={value.model} onChange={(e) => set({ model: e.target.value })} />
        <TextField
          label="IMEI / nº de serie · opcional"
          hint="Marca *#06# en el móvil para verlo."
          autoComplete="off"
          value={value.imei}
          onChange={(e) => set({ imei: cleanImei(e.target.value) })}
        />
        <TextField
          label="Código de desbloqueo · opcional"
          hint="Se guarda cifrado. El patrón se añade desde la orden."
          autoComplete="off"
          value={value.code}
          onChange={(e) => set({ code: e.target.value })}
        />
      </div>
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
