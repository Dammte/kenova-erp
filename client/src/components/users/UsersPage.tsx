"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAuth, type Role } from "@/components/auth/AuthProvider";
import { Button, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import {
  ROLE_LABEL,
  initials,
  lastAccess,
  statusOf,
  suggestUsername,
  temporaryPassword,
  validateNewUser,
  type NewUserDraft,
  type NewUserErrors,
  type StoreOption,
  type UserRow,
} from "./users";
import styles from "./Users.module.css";

/** Design 3.6: partners only. Passwords are never shown, except a new temporary one, once. */
export function UsersPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>
            <strong>Sin permiso.</strong> Las cuentas las gestionan los socios.
          </p>
          <Link href="/panel" className={styles.link}>
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }
  return <Users meId={user?.id ?? null} />;
}

/** A temporary password just issued: shown once, to hand over in person. */
interface Issued {
  name: string;
  login: string;
  password: string;
}

/** Which row is asking «are you sure?», and for what. */
type Pending = { id: string; action: "reset" | "deactivate" } | null;

function Users({ meId }: { meId: string | null }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFailed(false);
    Promise.all([
      apiFetch(`${API_URL}/users`).then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as UserRow[];
      }),
      apiFetch(`${API_URL}/stores`)
        .then(async (r) => (r.ok ? ((await r.json()) as StoreOption[]) : []))
        .catch(() => []),
    ])
      .then(([u, s]) => {
        if (!live) return;
        setUsers(u);
        setStores(s);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  const storeName = (id: string | null) => (id ? (stores.find((s) => s.id === id)?.name ?? "—") : "Todas");
  const reload = () => setAttempt((n) => n + 1);

  const act = async (u: UserRow, action: "reset" | "deactivate" | "reactivate") => {
    setBusy(u.id);
    setProblem(null);
    try {
      let res: Response;
      let password: string | null = null;
      if (action === "reset") {
        password = temporaryPassword();
        res = await apiFetch(`${API_URL}/users/${u.id}/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ temporaryPassword: password }),
        });
      } else {
        res = await apiFetch(`${API_URL}/users/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: action === "reactivate" }),
        });
      }
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar el cambio."));
        return;
      }
      if (password) setIssued({ name: u.fullName, login: u.email, password });
      setPending(null);
      reload();
    } catch {
      setProblem("No se ha podido guardar el cambio. Comprueba la conexión.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${styles.page} ${creating ? styles.withCard : ""}`}>
      <section className={styles.listPane} aria-label="Usuarios">
        <header className={styles.top}>
          <h1 className={styles.title}>Usuarios</h1>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            + Nuevo usuario
          </Button>
        </header>

        {issued && <IssuedPassword issued={issued} onClose={() => setIssued(null)} />}
        {problem && (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        )}
        {failed && (
          <div role="alert" className={styles.error}>
            No se han podido cargar los usuarios.{" "}
            <Button size="sm" onClick={reload}>
              Reintentar
            </Button>
          </div>
        )}
        {!users && !failed && <p className={styles.muted}>Cargando…</p>}

        {users && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th className={styles.wide}>Tienda</th>
                <th>Estado</th>
                <th className={styles.wide}>Último acceso</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const status = statusOf(u);
                const me = u.id === meId;
                const asking = pending?.id === u.id ? pending.action : null;
                return (
                  <tr key={u.id} className={u.isActive ? undefined : styles.off}>
                    <td>
                      <div className={styles.who}>
                        <span className={styles.avatar} aria-hidden>
                          {initials(u.fullName)}
                        </span>
                        <span>
                          <strong>{u.fullName}</strong>
                          <span className={styles.sub}>
                            {u.email} · @{u.username}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td className={styles.wide}>{storeName(u.storeId)}</td>
                    <td>
                      <span className={`${styles.status} ${styles[status.tone]}`}>{status.label}</span>
                      {status.note && <span className={styles.sub}>{status.note}</span>}
                    </td>
                    <td className={styles.wide}>{lastAccess(u.lastLoginAt)}</td>
                    <td className={styles.actions}>
                      {asking ? (
                        <span className={styles.confirm}>
                          <span>
                            {asking === "reset"
                              ? "Se cerrarán sus sesiones y tendrá que cambiarla al entrar."
                              : "Se cerrarán sus sesiones al momento."}
                          </span>
                          <Button
                            size="sm"
                            variant={asking === "deactivate" ? "danger" : "primary"}
                            loading={busy === u.id}
                            onClick={() => act(u, asking)}
                          >
                            {asking === "reset" ? "Sí, restablecer" : "Sí, desactivar"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                            Cancelar
                          </Button>
                        </span>
                      ) : me ? (
                        <span className={styles.muted}>Tú · no puedes desactivarte</span>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => setPending({ id: u.id, action: "reset" })}>
                            Restablecer contraseña
                          </Button>
                          {u.isActive ? (
                            <Button size="sm" variant="ghost" onClick={() => setPending({ id: u.id, action: "deactivate" })}>
                              Desactivar
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" loading={busy === u.id} onClick={() => act(u, "reactivate")}>
                              Reactivar
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className={styles.muted}>
          Nunca se muestran contraseñas. Desactivar cierra sus sesiones abiertas al momento; sus órdenes y cobros siguen
          con su nombre.
        </p>
      </section>

      {creating && (
        <NewUser
          stores={stores.filter((s) => s.isActive)}
          onCancel={() => setCreating(false)}
          onCreated={(i) => {
            setCreating(false);
            setIssued(i);
            reload();
          }}
        />
      )}
    </div>
  );
}

function IssuedPassword({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.issued} role="status">
      <p>
        <strong>Contraseña temporal de {issued.name}</strong> · entra con {issued.login}
      </p>
      <p className={styles.password}>{issued.password}</p>
      <p className={styles.muted}>
        Dásela en persona o por teléfono, no por chat. Solo se muestra ahora; al entrar tendrá que cambiarla.
      </p>
      <p className={styles.issuedActions}>
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(issued.password).then(() => setCopied(true));
          }}
        >
          {copied ? "Copiada" : "Copiar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Ya la he entregado
        </Button>
      </p>
    </div>
  );
}

const EMPTY: NewUserDraft = { fullName: "", username: "", email: "", role: "STORE_ADMIN", storeId: "" };

function NewUser({
  stores,
  onCancel,
  onCreated,
}: {
  stores: StoreOption[];
  onCancel: () => void;
  onCreated: (issued: Issued) => void;
}) {
  const [draft, setDraft] = useState<NewUserDraft>({ ...EMPTY, storeId: stores.length === 1 ? stores[0]!.id : "" });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [errors, setErrors] = useState<NewUserErrors>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const set = <K extends keyof NewUserDraft>(k: K, v: NewUserDraft[K]) => {
    setDraft((d) => ({
      ...d,
      [k]: v,
      // The username follows the name until it is typed by hand.
      ...(k === "fullName" && !usernameTouched ? { username: suggestUsername(String(v)) } : {}),
    }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateNewUser(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setProblem(null);
    const password = temporaryPassword();
    try {
      const res = await apiFetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: draft.fullName.trim(),
          username: draft.username.trim(),
          email: draft.email.trim().toLowerCase(),
          role: draft.role,
          ...(draft.role === "STORE_ADMIN" ? { storeId: draft.storeId } : {}),
          temporaryPassword: password,
        }),
      });
      if (res.status === 409) {
        setProblem("Ya hay una cuenta con ese email o ese usuario.");
        return;
      }
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido crear la cuenta."));
        return;
      }
      onCreated({ name: draft.fullName.trim(), login: draft.email.trim().toLowerCase(), password });
    } catch {
      setProblem("No se ha podido crear la cuenta. Comprueba la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const roles: [Role, string, string][] = [
    ["STORE_ADMIN", "Tienda", "Una cuenta por tienda aliada; solo ve su tienda."],
    ["SUPER_ADMIN", "Socio", "Ve todas las tiendas, el inventario y los usuarios."],
  ];

  return (
    <aside className={styles.card} aria-label="Nuevo usuario">
      <header className={styles.cardHead}>
        <h2>Nuevo usuario</h2>
        <button type="button" className={styles.close} aria-label="Cerrar sin guardar" onClick={onCancel}>
          <X size={18} aria-hidden />
        </button>
      </header>
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="Nombre"
          required
          placeholder="Marta Ibáñez"
          value={draft.fullName}
          error={errors.fullName}
          onChange={(e) => set("fullName", e.target.value)}
        />
        <TextField
          label="Email"
          required
          type="email"
          placeholder="villarcayo@kenova.es"
          value={draft.email}
          error={errors.email}
          onChange={(e) => set("email", e.target.value)}
        />
        <TextField
          label="Usuario"
          required
          hint="Para entrar sin escribir el email."
          prefix="@"
          value={draft.username}
          error={errors.username}
          onChange={(e) => {
            setUsernameTouched(true);
            set("username", e.target.value);
          }}
        />
        <fieldset className={styles.roles}>
          <legend className={styles.fieldLabel}>Rol</legend>
          {roles.map(([r, label, help]) => (
            <label key={r} className={styles.role}>
              <input type="radio" name="role" checked={draft.role === r} onChange={() => set("role", r)} />
              <span>
                <strong>{label}</strong>
                <span className={styles.sub}>{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {draft.role === "STORE_ADMIN" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tienda</span>
            <select
              className={styles.select}
              value={draft.storeId}
              aria-invalid={errors.storeId ? true : undefined}
              onChange={(e) => set("storeId", e.target.value)}
            >
              <option value="">Elige la tienda</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.storeId && <span className={styles.error}>{errors.storeId}</span>}
          </label>
        )}
        <p className={styles.muted}>Se genera una contraseña temporal que verás una sola vez.</p>
        {problem && (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        )}
        <div className={styles.formActions}>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={saving} loadingText="Creando…">
            Crear usuario
          </Button>
        </div>
      </form>
    </aside>
  );
}
