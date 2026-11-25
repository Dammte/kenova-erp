"use client";

import { useState, type FormEvent } from "react";
import { Button, TextField, type TextFieldProps } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatDay } from "@/components/stores/stores";
import { formatEur } from "@/lib/format";
import {
  FIELDS,
  connectionBody,
  connectionDraftFrom,
  validateConnection,
  type ConnectionDraft,
  type ConnectionErrors,
  type WebTestResult,
} from "./connection";
import type { SupplierData } from "./suppliers";
import stores from "../stores/Stores.module.css";
import own from "./Suppliers.module.css";

const styles = { ...stores, ...own };

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
      <TestConnection supplier={supplier} />
    </>
  );
}

function ConnectionForm({ supplier, onSaved }: Props) {
  const original = connectionDraftFrom(supplier.connection, supplier.website);
  const [d, setD] = useState<ConnectionDraft>(original);
  const [errors, setErrors] = useState<ConnectionErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A new connection starts from PrestaShop's places: it still has to be saved.
  const dirty = !supplier.connection || JSON.stringify(d) !== JSON.stringify(original);

  const set = (key: string, value: string) => {
    setD((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const field = (key: string, label: string, extra: Partial<TextFieldProps> = {}) => (
    <TextField
      key={key}
      label={label}
      value={d[key] ?? ""}
      error={errors[key]}
      spellCheck={false}
      autoCapitalize="off"
      onChange={(e) => set(key, e.target.value)}
      {...extra}
    />
  );
  const spec = (section: keyof typeof FIELDS, kind: "page" | "place") =>
    FIELDS[section]
      .filter((f) => (kind === "page" ? f.kind === "page" || f.kind === "input" : f.kind === "selector" || f.kind === "pattern"))
      .map((f) =>
        field(f.key, f.optional ? `${f.label} · opcional` : f.label, {
          required: !f.optional,
          placeholder: f.needs ? `…${f.needs}…` : undefined,
        }),
      );
  const places = (section: keyof typeof FIELDS, title: string) => {
    const keys = FIELDS[section].filter((f) => f.kind === "selector" || f.kind === "pattern").map((f) => f.key);
    return (
      <details className={styles.places} open={keys.some((k) => errors[k])}>
        <summary>{title}</summary>
        <p className={styles.muted}>
          Dónde está cada dato dentro de la página (selectores CSS). Solo hay que tocarlos si «Probar conexión» no lee bien.
        </p>
        {spec(section, "place")}
      </details>
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateConnection(d);
    setErrors(found);
    if (Object.keys(found).some((k) => found[k])) return;
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
          Las páginas de su web de las que el ERP lee tus pedidos. Solo lee: lo único que envía es el inicio de sesión. Si el
          proveedor cambia algo, se corrige aquí.
        </p>
        {field("baseUrl", "Dirección base", {
          required: true,
          inputMode: "url",
          placeholder: "https://b2b.proveedor.es",
          hint: "Solo el dominio. El ERP no llama a ninguna otra dirección.",
        })}
        {spec("login", "page")}
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Historial de pedidos</legend>
        {spec("history", "page")}
        {places("history", "Dónde está cada dato del historial")}
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Pedido</legend>
        {spec("detail", "page")}
        {places("detail", "Dónde está cada dato del pedido")}
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
          {supplier.connection && (
            <Button
              variant="ghost"
              onClick={() => {
                setD(original);
                setErrors({});
              }}
            >
              Descartar
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

const shortDate = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const money = (v: string | null) => (v === null ? "—" : formatEur(Number(v)));

/** «Probar conexión»: logs in and reads, to check the places; saves nothing. */
function TestConnection({ supplier }: { supplier: SupplierData }) {
  const [result, setResult] = useState<WebTestResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blocker = !supplier.connection
    ? "Guarda antes la conexión"
    : !supplier.credentialsUpdatedAt
      ? "Guarda antes las credenciales"
      : undefined;

  const test = async () => {
    setProblem(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await apiFetch(`${API_URL}/suppliers/${supplier.id}/test`, { method: "POST" });
      if (!res.ok) return setProblem(await errorMessage(res, "No se ha podido probar la conexión."));
      setResult((await res.json()) as WebTestResult);
    } catch {
      setProblem("No se ha podido probar la conexión. Comprueba la conexión a internet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section} aria-label="Probar conexión">
      <h3 className={styles.subTitle}>Probar conexión</h3>
      <p className={styles.muted}>Entra en su web, lee el historial y el último pedido, y te enseña lo que ha entendido. No guarda nada.</p>
      <div>
        <Button variant="secondary" size="sm" loading={busy} loadingText="Leyendo su web…" disabledReason={blocker} onClick={() => void test()}>
          Probar conexión
        </Button>
      </div>
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      {result && (
        <div className={styles.testResult}>
          <p>
            <strong>
              {result.ordersFound === 1 ? "1 pedido" : `${result.ordersFound} pedidos`} en el historial.
            </strong>{" "}
            {result.ordersFound > result.orders.length && `Estos son los ${result.orders.length} más recientes.`}
          </p>
          {result.warnings.map((w) => (
            <p key={w} className={styles.warn}>
              {w}
            </p>
          ))}
          {result.orders.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {result.orders.map((o) => (
                  <tr key={o.externalId}>
                    <td>
                      <a href={o.detailUrl} target="_blank" rel="noreferrer" className={styles.link}>
                        {o.reference}
                      </a>
                    </td>
                    <td>{shortDate(o.date)}</td>
                    <td>{money(o.total)}</td>
                    <td>{o.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.sample && (
            <>
              <h4 className={styles.subTitle}>Líneas del pedido {result.sample.order.reference}</h4>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Ref.</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sample.lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        {l.productUrl ? (
                          <a href={l.productUrl} target="_blank" rel="noreferrer" className={styles.link}>
                            {l.description}
                          </a>
                        ) : (
                          l.description
                        )}
                      </td>
                      <td>{l.ref ?? "—"}</td>
                      <td>{l.quantity ?? "—"}</td>
                      <td>{money(l.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </section>
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
