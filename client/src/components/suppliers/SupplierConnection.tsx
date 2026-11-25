"use client";

import { useState, type FormEvent } from "react";
import { Button, TextField, type TextFieldProps } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatDay } from "@/components/stores/stores";
import {
  connectionBody,
  connectionDraftFrom,
  validateConnection,
  type ConnectionDraft,
  type ConnectionErrors,
  type TextKey,
} from "./connection";
import type { SupplierData } from "./suppliers";
import styles from "../stores/Stores.module.css";

interface Props {
  supplier: SupplierData;
  onSaved: () => void;
}

/**
 * How the ERP reads this supplier's orders from its website: routes, login
 * and which field is which. All of it editable, so a change on the supplier's
 * side is fixed here.
 */
export function SupplierConnection({ supplier, onSaved }: Props) {
  return (
    <>
      <ConnectionForm supplier={supplier} onSaved={onSaved} />
      <Credentials supplier={supplier} onSaved={onSaved} />
    </>
  );
}

function ConnectionForm({ supplier, onSaved }: Props) {
  const original = connectionDraftFrom(supplier.connection);
  const [d, setD] = useState<ConnectionDraft>(original);
  const [errors, setErrors] = useState<ConnectionErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(original);

  const set = <K extends keyof ConnectionDraft>(key: K, value: ConnectionDraft[K]) => {
    setD((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const field = (key: TextKey, label: string, extra: Partial<TextFieldProps> = {}) => (
    <TextField
      label={label}
      value={d[key]}
      error={errors[key]}
      spellCheck={false}
      autoCapitalize="off"
      onChange={(e) => set(key, e.target.value)}
      {...extra}
    />
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateConnection(d);
    setErrors(found);
    if (Object.keys(found).length) return;
    setProblem(null);
    setSaving(true);
    try {
      const res = await apiFetch(`${API_URL}/suppliers/${supplier.id}/connection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectionBody(d)),
      });
      if (!res.ok) return setProblem(await errorMessage(res, "No se ha podido guardar la conexión."));
      onSaved();
    } catch {
      setProblem("No se ha podido guardar la conexión. Comprueba la conexión a internet; los datos siguen aquí.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Conexión con su web">
      <fieldset className={styles.section}>
        <legend>Conexión con su web</legend>
        <p className={styles.muted}>
          Lo que necesita el ERP para leer tus pedidos en la web del proveedor. Si el proveedor cambia algo, se corrige aquí.
        </p>
        {field("baseUrl", "Dirección base", {
          required: true,
          inputMode: "url",
          placeholder: "https://b2b.proveedor.es",
          hint: "Solo el dominio. El ERP no llama a ninguna otra dirección.",
        })}
        <div className={styles.pair}>
          {field("listPath", "Ruta de la lista de pedidos", { required: true, placeholder: "/api/orders" })}
          {field("detailPath", "Ruta del detalle · opcional", {
            placeholder: "/api/orders/{id}",
            hint: "Con {id} donde va el pedido. Vacío si la lista ya trae las líneas.",
          })}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Inicio de sesión</legend>
        {field("loginPath", "Ruta de inicio de sesión", { required: true, placeholder: "/api/login" })}
        <div className={styles.radios} role="radiogroup" aria-label="Formato">
          {(
            [
              ["json", "Envía JSON"],
              ["form", "Envía formulario"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={styles.radio}>
              <input type="radio" name="format" checked={d.format === value} onChange={() => set("format", value)} />
              {label}
            </label>
          ))}
        </div>
        <div className={styles.pair}>
          {field("userField", "Campo del usuario", { required: true, placeholder: "email" })}
          {field("passwordField", "Campo de la contraseña", { required: true, placeholder: "password" })}
        </div>
        <div className={styles.radios} role="radiogroup" aria-label="Sesión">
          {(
            [
              ["cookie", "Sesión por cookie"],
              ["token", "Sesión por token"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={styles.radio}>
              <input type="radio" name="session" checked={d.session === value} onChange={() => set("session", value)} />
              {label}
            </label>
          ))}
        </div>
        {d.session === "token" &&
          field("tokenPath", "Dónde viene el token", { required: true, placeholder: "data.token" })}
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Qué campo es cada dato</legend>
        <p className={styles.muted}>
          Los nombres tal como vienen en la respuesta de su web. Si un dato va dentro de otro, con puntos: data.pedidos.
        </p>
        <div className={styles.pair}>
          {field("itemsPath", "Dónde está la lista · opcional", {
            placeholder: "data.orders",
            hint: "Vacío si la respuesta ya es la lista.",
          })}
          {field("idField", "Id del pedido", { required: true, placeholder: "id" })}
        </div>
        <div className={styles.pair}>
          {field("numberField", "Número del pedido · opcional", { placeholder: "reference" })}
          {field("dateField", "Fecha del pedido · opcional", { placeholder: "date" })}
        </div>
        <div className={styles.pair}>
          {field("linesPath", "Dónde están las líneas", { required: true, placeholder: "lines" })}
          {field("refField", "Referencia · opcional", { placeholder: "sku" })}
        </div>
        {field("descriptionField", "Descripción", { required: true, placeholder: "name" })}
        <div className={styles.pair}>
          {field("quantityField", "Cantidad", { required: true, placeholder: "quantity" })}
          {field("unitCostField", "Coste por unidad", { required: true, placeholder: "unit_price" })}
        </div>
      </fieldset>

      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      {dirty && (
        <div className={styles.saveBar}>
          <Button type="submit" variant="primary" loading={saving} loadingText="Guardando…">
            Guardar conexión
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setD(original);
              setErrors({});
            }}
          >
            Descartar
          </Button>
        </div>
      )}
    </form>
  );
}

/** The website login: written once, kept encrypted, never shown again. */
function Credentials({ supplier, onSaved }: Props) {
  const saved = supplier.credentialsUpdatedAt;
  const [editing, setEditing] = useState(!saved);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const call = async (init: RequestInit) => {
    setProblem(null);
    setBusy(true);
    try {
      const res = await apiFetch(`${API_URL}/suppliers/${supplier.id}/credentials`, init);
      if (!res.ok) return setProblem(await errorMessage(res, "No se han podido guardar las credenciales."));
      onSaved();
    } catch {
      setProblem("No se han podido guardar las credenciales. Comprueba la conexión a internet.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setProblem("Escribe el usuario y la contraseña.");
    void call({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Credenciales de su web">
      <fieldset className={styles.section}>
        <legend>Credenciales de su web</legend>
        {saved ? (
          <p>
            <span className={styles.ok}>Guardadas el {formatDay(saved)}</span>
          </p>
        ) : (
          <p className={styles.muted}>Sin credenciales.</p>
        )}
        <p className={styles.muted}>
          Se guardan cifradas y no se vuelven a mostrar: solo se pueden sustituir. Si el proveedor lo permite, usa un usuario
          solo para el ERP.
        </p>
        {editing ? (
          <>
            <div className={styles.pair}>
              <TextField
                label="Usuario"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <TextField
                label="Contraseña"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className={styles.saveBar}>
              <Button type="submit" variant="primary" loading={busy} loadingText="Guardando…">
                Guardar credenciales
              </Button>
              {saved && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </>
        ) : confirmDelete ? (
          <div className={styles.confirm}>
            <span>¿Borrar las credenciales? El ERP dejará de poder leer los pedidos.</span>
            <Button variant="danger" size="sm" loading={busy} onClick={() => void call({ method: "DELETE" })}>
              Sí, borrar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              No
            </Button>
          </div>
        ) : (
          <div className={styles.radios}>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Cambiar credenciales
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              Borrar
            </Button>
          </div>
        )}
        {problem && (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        )}
      </fieldset>
    </form>
  );
}
