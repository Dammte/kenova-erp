"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button, MoneyInput, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import {
  commissionExample,
  commissionLabel,
  emptyStore,
  formatDay,
  orderCount,
  storeBody,
  storeDraftFrom,
  validateStore,
  type CommissionChange,
  type CommissionType,
  type StoreData,
  type StoreDraft,
  type StoreErrors,
} from "./stores";
import styles from "./Stores.module.css";

/** GET /api/users, the fields this screen needs. */
export interface StoreUser {
  id: string;
  fullName: string;
  role: "SUPER_ADMIN" | "STORE_ADMIN";
  storeId: string | null;
  isActive: boolean;
}

interface Props {
  /** The store to edit; without it the form creates one. */
  store?: StoreData;
  /** Its active store accounts. */
  accounts: StoreUser[];
  onSaved: (id: string) => void;
  onCancel: () => void;
}

/** Design R2 3.7: one store, every setting, one «Guardar». */
export function StoreForm({ store, accounts, onSaved, onCancel }: Props) {
  const original = store ? storeDraftFrom(store) : undefined;
  const isMain = store?.isMain ?? false;
  const [d, setD] = useState<StoreDraft>(original ?? emptyStore());
  const [errors, setErrors] = useState<StoreErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<CommissionChange[]>([]);
  const [confirmOff, setConfirmOff] = useState(false);
  // What is typed in «Porcentaje», so «12,» survives until the next digit.
  const [commissionText, setCommissionText] = useState(
    d.commissionValue === null ? "" : String(d.commissionValue).replace(".", ","),
  );
  const typeCommission = (text: string) => {
    setCommissionText(text);
    const n = Number(text.replace(",", ".").trim());
    set("commissionValue", text.trim() === "" || Number.isNaN(n) ? null : n);
  };

  useEffect(() => {
    if (!store || store.isMain) return;
    let live = true;
    apiFetch(`${API_URL}/stores/${store.id}/commission-history`)
      .then(async (res) => res.ok && live && setHistory((await res.json()) as CommissionChange[]))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store]);

  const set = <K extends keyof StoreDraft>(key: K, value: StoreDraft[K]) => {
    setD((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const body = storeBody(d, original, isMain);
  const dirty = !store || Object.keys(body).length > 0;
  const prefixLocked = store !== undefined && orderCount(store) > 0;

  const send = async (payload: Record<string, unknown>) => {
    setProblem(null);
    setSaving(true);
    try {
      const res = await apiFetch(store ? `${API_URL}/stores/${store.id}` : `${API_URL}/stores`, {
        method: store ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se han podido guardar los cambios."));
        return;
      }
      const saved = (await res.json()) as { id: string };
      onSaved(saved.id);
    } catch {
      setProblem("No se han podido guardar los cambios. Comprueba la conexión; los datos siguen aquí.");
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateStore(d, isMain);
    setErrors(found);
    if (Object.keys(found).length) return;
    void send(body);
  };

  const example = commissionExample(d.commissionType, d.commissionValue);
  const title = store ? store.name : "Nueva tienda";

  return (
    <aside className={styles.card} aria-label={store ? `Tienda ${store.name}` : "Nueva tienda"}>
      <form onSubmit={submit} noValidate>
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>
            {title}
            {store && <span className={styles.prefix}>{store.prefix}</span>}
          </h2>
          {store && (
            <span className={store.isActive ? styles.ok : styles.off}>
              {store.isActive ? "Activa" : "Desactivada"}
            </span>
          )}
          <button type="button" className={styles.close} onClick={onCancel} aria-label="Cerrar">
            <X size={18} aria-hidden />
          </button>
        </header>

        <fieldset className={styles.section}>
          <legend>Datos</legend>
          <div className={styles.pair}>
            <TextField label="Nombre" required value={d.name} error={errors.name} onChange={(e) => set("name", e.target.value)} />
            <TextField label="Ciudad" required value={d.city} error={errors.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <TextField
            label="Prefijo"
            required
            value={d.prefix}
            maxLength={4}
            readOnly={prefixLocked}
            error={errors.prefix}
            hint={
              prefixLocked
                ? `Fijo: ya hay ${store ? orderCount(store) : 0} órdenes con ${store?.prefix}-`
                : "Va delante del número de cada orden, por ejemplo VC-0001."
            }
            onChange={(e) => set("prefix", e.target.value.toUpperCase())}
          />
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Impresos</legend>
          <p className={styles.muted}>Salen en el ticket, la hoja de taller y la etiqueta.</p>
          <TextField label="Dirección" value={d.address} onChange={(e) => set("address", e.target.value)} />
          <TextField label="Teléfono" value={d.phone} inputMode="tel" onChange={(e) => set("phone", e.target.value)} />
          <p className={styles.muted}>Datos legales · opcionales, no se imprimen si están vacíos.</p>
          <div className={styles.pair}>
            <TextField label="Razón social" value={d.legalName} onChange={(e) => set("legalName", e.target.value)} />
            <TextField label="NIF" value={d.taxId} onChange={(e) => set("taxId", e.target.value.toUpperCase())} />
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Caja</legend>
          <div className={styles.trio}>
            <TextField label="Abre" type="time" value={d.cashOpensAt} error={errors.cashOpensAt} onChange={(e) => set("cashOpensAt", e.target.value)} />
            <TextField label="Cierra" type="time" value={d.cashClosesAt} error={errors.cashClosesAt} onChange={(e) => set("cashClosesAt", e.target.value)} />
            <MoneyInput label="Fondo inicial" value={d.cashFloat} error={errors.cashFloat} onChange={(v) => set("cashFloat", v)} />
          </div>
          <p className={styles.muted}>
            El día de caja se abre y se cierra solo. El fondo inicial solo se usa el primer día; después pasa el esperado del día anterior.
          </p>
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Taller</legend>
          <TextField
            label="Días de garantía"
            type="number"
            min={90}
            inputMode="numeric"
            value={d.warrantyDays}
            error={errors.warrantyDays}
            hint="Días desde la entrega. El mínimo legal es 90."
            onChange={(e) => set("warrantyDays", e.target.value)}
          />
        </fieldset>

        {!isMain && (
          <fieldset className={styles.section}>
            <legend>Comisión de la tienda</legend>
            <p className={styles.muted}>Se guarda en cada orden al entregarla; las ya entregadas no cambian.</p>
            <div className={styles.radios} role="radiogroup" aria-label="Tipo de comisión">
              {(
                [
                  ["percent", "Porcentaje"],
                  ["fixed", "Importe fijo"],
                  [null, "Sin comisión"],
                ] as [CommissionType | null, string][]
              ).map(([value, label]) => (
                <label key={label} className={styles.radio}>
                  <input
                    type="radio"
                    name="commissionType"
                    checked={d.commissionType === value}
                    onChange={() => {
                      set("commissionType", value);
                      if (value !== d.commissionType) typeCommission("");
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {d.commissionType === "percent" && (
              <TextField
                label="Porcentaje"
                inputMode="decimal"
                suffix="%"
                value={commissionText}
                error={errors.commissionValue}
                hint={example ?? undefined}
                onChange={(e) => typeCommission(e.target.value)}
              />
            )}
            {d.commissionType === "fixed" && (
              <MoneyInput
                label="Importe por equipo"
                value={d.commissionValue}
                error={errors.commissionValue}
                hint={example ?? undefined}
                onChange={(v) => set("commissionValue", v)}
              />
            )}
            {history.length > 0 && (
              <div>
                <h3 className={styles.subTitle}>Historial de cambios</h3>
                <ol className={styles.history}>
                  {history.map((h) => (
                    <li key={h.id}>
                      <span>{formatDay(h.createdAt)}</span>
                      <span>{commissionLabel(h.type, h.value)}</span>
                      <span className={styles.muted}>{h.changedBy?.fullName ?? "—"}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </fieldset>
        )}

        {store && !isMain && (
          <fieldset className={styles.section}>
            <legend>Usuario de la tienda</legend>
            {accounts.length ? (
              <ul className={styles.accounts}>
                {accounts.map((a) => (
                  <li key={a.id}>{a.fullName}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.warn}>Sin usuario: nadie puede entrar en esta tienda todavía.</p>
            )}
            <Link href="/usuarios" className={styles.link}>
              {accounts.length ? "Gestionar en Usuarios" : "Crear su usuario en Usuarios"}
            </Link>
          </fieldset>
        )}

        {store && !isMain && (
          <fieldset className={styles.section}>
            <legend>{store.isActive ? "Desactivar tienda" : "Tienda desactivada"}</legend>
            {store.isActive ? (
              <>
                <p className={styles.muted}>
                  Deja de aparecer en altas y su usuario no podrá entrar. Sus órdenes se conservan.
                </p>
                {confirmOff ? (
                  <div className={styles.confirm}>
                    <span>¿Desactivar {store.name}? Se cerrarán las sesiones de su usuario.</span>
                    <Button variant="danger" size="sm" loading={saving} onClick={() => void send({ isActive: false })}>
                      Sí, desactivar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmOff(false)}>
                      No
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setConfirmOff(true)}>
                    Desactivar…
                  </Button>
                )}
              </>
            ) : (
              <Button variant="secondary" size="sm" loading={saving} onClick={() => void send({ isActive: true })}>
                Reactivar
              </Button>
            )}
          </fieldset>
        )}

        {problem && (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        )}
        {dirty && (
          <div className={styles.saveBar}>
            <Button type="submit" variant="primary" loading={saving} loadingText="Guardando…">
              {store ? "Guardar cambios" : "Crear tienda"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!original) return onCancel();
                setD(original);
                setCommissionText(
                  original.commissionValue === null ? "" : String(original.commissionValue).replace(".", ","),
                );
                setErrors({});
              }}
            >
              {store ? "Descartar" : "Cancelar"}
            </Button>
          </div>
        )}
      </form>
    </aside>
  );
}
