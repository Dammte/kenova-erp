"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { MessageCircle, Phone, X } from "lucide-react";
import { FAULT_LABEL } from "@/components/orders/orderList";
import { whatsappHref } from "@/components/orders/orderDetail";
import { Button, StatusChip } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import {
  DOC_LABEL,
  documentProblem,
  formatDay,
  formatPhone,
  fullName,
  initials,
  type ClientData,
  type ClientSummary,
  type DuplicateOf,
} from "./clients";
import styles from "./Clients.module.css";

const DEVICES_SHOWN = 4;
type Editable = "firstName" | "lastName" | "phoneNumber" | "dniType" | "dni" | "email" | "address" | "city";
const FIELDS: { key: Editable; label: string; required?: boolean }[] = [
  { key: "firstName", label: "Nombre", required: true },
  { key: "lastName", label: "Apellidos" },
  { key: "phoneNumber", label: "Teléfono" },
  { key: "dni", label: "Documento" },
  { key: "email", label: "Email" },
  { key: "address", label: "Dirección" },
  { key: "city", label: "Ciudad" },
];

/** The client card of design 3.3: figures, actions, data edited in place, devices and history. */
export function ClientCard({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [client, setClient] = useState<ClientData | null>(null);
  const [summary, setSummary] = useState<ClientSummary | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateOf[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const get = async <T,>(path: string): Promise<T> => {
      const res = await apiFetch(`${API_URL}/clients/${id}${path}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    };
    Promise.all([get<ClientData>(""), get<ClientSummary>("/summary"), get<DuplicateOf[]>("/duplicates")])
      .then(([c, s, d]) => {
        if (!live) return;
        setClient(c);
        setSummary(s);
        setDuplicates(d);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const reload = (message: string) => {
    setNotice(message);
    setAttempt((n) => n + 1);
    onChanged();
  };

  const post = async (path: string, body?: object): Promise<boolean> => {
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/clients/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar."));
        return false;
      }
      return true;
    } catch {
      setProblem("No se ha podido guardar: se ha perdido la conexión.");
      return false;
    }
  };

  if (failed) {
    return (
      <aside className={styles.card} aria-label="Ficha del cliente">
        <p role="alert" className={styles.error}>
          No se ha podido abrir la ficha.{" "}
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </p>
      </aside>
    );
  }
  if (!client || !summary) {
    return (
      <aside className={styles.card} aria-label="Ficha del cliente">
        <p className={styles.muted}>Cargando…</p>
      </aside>
    );
  }

  const name = fullName(client);
  const dup = duplicates[0];
  return (
    <aside className={styles.card} aria-label={`Ficha de ${name}`}>
      <header className={styles.cardHead}>
        <span className={styles.avatar} aria-hidden>
          {initials(client)}
        </span>
        <div className={styles.cardTitle}>
          <h2>{name}</h2>
          <p className={styles.muted}>
            Cliente desde {formatDay(client.createdAt.slice(0, 10))} · {summary.stats.orders}{" "}
            {summary.stats.orders === 1 ? "orden" : "órdenes"} · gastado {formatEur(summary.stats.spent)}
          </p>
        </div>
        <button type="button" className={styles.close} aria-label="Cerrar ficha" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className={styles.actions}>
        {client.phoneNumber && (
          <>
            <a className={styles.action} href={`tel:${client.phoneNumber.replace(/\s/g, "")}`}>
              <Phone size={14} aria-hidden /> Llamar
            </a>
            <a className={styles.action} href={whatsappHref(client.phoneNumber)} target="_blank" rel="noreferrer">
              <MessageCircle size={14} aria-hidden /> WhatsApp
            </a>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (await post(client.isActive ? "archive" : "restore")) {
              reload(client.isActive ? `${name} archivado. Sus órdenes se conservan.` : `${name} vuelve a estar activo.`);
            }
          }}
        >
          {client.isActive ? "Archivar" : "Recuperar"}
        </Button>
        {client.isActive && (
          <Link className={styles.primaryLink} href={`/ordenes/nueva?cliente=${client.id}`}>
            + Nueva alta para este cliente
          </Link>
        )}
      </div>

      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}

      {dup && (
        <div className={styles.dupBanner} role="note">
          <p>
            Posible duplicado: «{fullName(dup)}» tiene {dup.samePhone ? `el mismo teléfono (${formatPhone(dup.phoneNumber)})` : "el mismo documento"}
            {dup.orders > 0 ? ` y ${dup.orders} ${dup.orders === 1 ? "orden" : "órdenes"} del ${formatDay(dup.firstVisit)}` : ""}.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (await post("not-duplicate", { otherId: dup.id })) reload("No se volverá a avisar de este par.");
            }}
          >
            No es la misma persona
          </Button>
        </div>
      )}

      <dl className={styles.stats}>
        <div>
          <dt>Total gastado</dt>
          <dd>{formatEur(summary.stats.spent)}</dd>
        </div>
        <div>
          <dt>Saldo pendiente</dt>
          <dd className={Number(summary.stats.balance) > 0 ? styles.owed : undefined}>{formatEur(summary.stats.balance)}</dd>
        </div>
        <div>
          <dt>Abiertas</dt>
          <dd>{summary.stats.open}</dd>
        </div>
        <div>
          <dt>Última visita</dt>
          <dd>{formatDay(summary.stats.lastVisit)}</dd>
        </div>
      </dl>

      <ClientData key={`${client.id}-${attempt}`} client={client} onSaved={() => reload("Datos guardados")} />

      <section aria-labelledby="devices">
        <h3 id="devices" className={styles.sectionTitle}>
          Dispositivos · {summary.devices.length}
        </h3>
        <Devices devices={summary.devices} />
      </section>

      <section aria-labelledby="history">
        <h3 id="history" className={styles.sectionTitle}>
          Historial de órdenes
        </h3>
        {summary.history.total === 0 ? (
          <p className={styles.muted}>Sin órdenes.</p>
        ) : (
          <ul className={styles.history}>
            {summary.history.rows.map((o) => (
              <li key={o.id}>
                <Link href={`/ordenes?orden=${o.id}`} className={styles.historyLink}>
                  <span>
                    <strong>{o.code}</strong>
                    <span className={styles.muted}>
                      {" "}
                      {[o.model, o.faults.map((f) => FAULT_LABEL[f] ?? f).join(", ")].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={styles.muted}>{formatDay(o.date)}</span>
                  <StatusChip status={o.status} />
                  <span className={styles.num}>{formatEur(o.totalPrice)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {summary.history.total > summary.history.rows.length && (
          <Link className={styles.link} href={`/ordenes?tab=all&q=${encodeURIComponent(client.phoneNumber ?? name)}`}>
            Ver las {summary.history.total}
          </Link>
        )}
      </section>
    </aside>
  );
}

function Devices({ devices }: { devices: ClientSummary["devices"] }) {
  const [all, setAll] = useState(false);
  if (devices.length === 0) return <p className={styles.muted}>Sin dispositivos.</p>;
  const shown = all ? devices : devices.slice(0, DEVICES_SHOWN);
  return (
    <>
      <ul className={styles.devices}>
        {shown.map((d) => (
          <li key={d.id}>
            <strong>
              {d.brand === "Apple" ? "" : `${d.brand} `}
              {d.model}
            </strong>
            {d.imei && <span className={styles.muted}>…{d.imei.slice(-6)}</span>}
            <span className={styles.muted}>
              {d.orders} {d.orders === 1 ? "orden" : "órdenes"}
            </span>
          </li>
        ))}
      </ul>
      {!all && devices.length > DEVICES_SHOWN && (
        <button type="button" className={styles.linkButton} onClick={() => setAll(true)}>
          Ver los {devices.length}
        </button>
      )}
    </>
  );
}

/** Fields that look like text until hovered; the first change shows Guardar/Descartar. Ctrl+Intro saves. */
function ClientData({ client, onSaved }: { client: ClientData; onSaved: () => void }) {
  const initial = Object.fromEntries(FIELDS.map((f) => [f.key, client[f.key] ?? ""]).concat([["dniType", client.dniType]])) as Record<
    Editable,
    string
  >;
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const changed = (Object.keys(values) as Editable[]).filter((k) => values[k].trim() !== (initial[k] ?? "").trim());
  const docProblem = documentProblem(values.dniType, values.dni.trim() || null);
  const missingName = values.firstName.trim() === "";

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!changed.length || missingName || saving) return;
    setSaving(true);
    setProblem(null);
    const body = Object.fromEntries(changed.map((k) => [k, values[k].trim() || null]));
    if (changed.includes("dni") || changed.includes("dniType")) Object.assign(body, { dniType: values.dniType, dni: values.dni.trim() || null });
    try {
      const res = await apiFetch(`${API_URL}/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se han podido guardar los datos."));
        return;
      }
      onSaved();
    } catch {
      setProblem("No se han podido guardar los datos: se ha perdido la conexión.");
    } finally {
      setSaving(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
  };

  return (
    <form className={styles.data} onSubmit={save} onKeyDown={onKeyDown} aria-labelledby="data-title">
      <h3 id="data-title" className={styles.sectionTitle}>
        Datos <span className={styles.muted}>Pulsa un campo para editarlo</span>
      </h3>
      <div className={styles.fields}>
        {FIELDS.map((f) => (
          <label key={f.key} className={styles.field}>
            <span>
              {f.label}
              {f.required ? " *" : ""}
            </span>
            {f.key === "dni" ? (
              <span className={styles.docField}>
                <select
                  aria-label="Tipo de documento"
                  value={values.dniType}
                  onChange={(e) => setValues({ ...values, dniType: e.target.value })}
                >
                  {Object.entries(DOC_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <input aria-label="Documento" value={values.dni} onChange={(e) => setValues({ ...values, dni: e.target.value })} />
              </span>
            ) : (
              <input value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      {docProblem && <p className={styles.warning}>{docProblem}</p>}
      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      {changed.length > 0 && (
        <div className={styles.saveBar}>
          <Button type="submit" variant="primary" loading={saving} disabledReason={missingName ? "El nombre es obligatorio" : undefined}>
            Guardar
          </Button>
          <Button variant="ghost" onClick={() => setValues(initial)}>
            Descartar
          </Button>
        </div>
      )}
    </form>
  );
}
