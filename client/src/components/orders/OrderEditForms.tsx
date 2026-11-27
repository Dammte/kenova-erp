"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { FAULT_LABEL, PRIORITY_LABEL } from "./orderList";
import { CONTACT_LABEL, type OrderDetail } from "./orderDetail";
import styles from "./OrderPanel.module.css";

/**
 * Design R3 3.4: the full page edits block by block, «Editar» → fields →
 * «Guardar» or «Cancelar». Each form keeps what was typed when saving fails.
 */

type Save = "idle" | "saving" | "conflict";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const CONTACTS = Object.keys(CONTACT_LABEL) as OrderDetail["client"]["preferredContact"][];
const textOrNull = (s: string) => s.trim() || null;

function EditForm({
  label,
  saving,
  problem,
  conflict,
  onReload,
  onCancel,
  onSubmit,
  children,
}: {
  label: string;
  saving: boolean;
  problem: string | null;
  conflict?: boolean;
  onReload?: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!saving) onSubmit();
  };
  return (
    <form
      className={styles.finish}
      aria-label={label}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e);
      }}
    >
      {children}
      {conflict && (
        // Design R3 B5: nobody's change is overwritten in silence, and nothing typed is lost.
        <div className={styles.conflict} role="alert">
          <p>{problem}</p>
          <Button size="sm" onClick={onReload}>
            Recargar y conservar lo mío
          </Button>
        </div>
      )}
      {problem && !conflict && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      <p className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          disabledReason={conflict ? "Recarga primero para ver el otro cambio." : undefined}
        >
          Guardar
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </p>
    </form>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  max = 500,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  type?: string;
}) {
  return (
    <>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} className={styles.input} type={type} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </>
  );
}

interface FaultFields {
  priority: OrderDetail["priority"];
  reportedFaults: string[];
  faultNotes: string;
  physicalCondition: string;
  accessories: string;
  observations: string;
}

const faultFields = (order: OrderDetail): FaultFields => ({
  priority: order.priority,
  reportedFaults: order.reportedFaults,
  faultNotes: order.faultNotes ?? "",
  physicalCondition: order.physicalCondition ?? "",
  accessories: order.accessories ?? "",
  observations: order.observations ?? "",
});

/** The fields the user touched, as the API takes them (blank text is null). */
function changes(draft: FaultFields, touched: Set<keyof FaultFields>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of touched) {
    const value = draft[key];
    out[key] = typeof value === "string" && key !== "priority" ? textOrNull(value) : value;
  }
  return out;
}

/** The declared fault, the device's condition and the priority. */
export function FaultEditForm({
  order,
  onDirty,
  onSaved,
  onCancel,
  onReload,
}: {
  order: OrderDetail;
  onDirty: (dirty: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
  /** Reloads the order and keeps this form as it is. */
  onReload: () => void;
}) {
  const [draft, setDraft] = useState(() => faultFields(order));
  // Only what the user changed is kept on a reload and sent: the rest is
  // whatever the order has now, so another person's change is not undone.
  const touched = useRef(new Set<keyof FaultFields>());
  const [state, setState] = useState<Save>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof FaultFields>(key: K, value: FaultFields[K]) => {
    touched.current.add(key);
    setDraft((d) => ({ ...d, [key]: value }));
    onDirty(true);
  };
  const toggle = (fault: string) =>
    set(
      "reportedFaults",
      draft.reportedFaults.includes(fault) ? draft.reportedFaults.filter((f) => f !== fault) : [...draft.reportedFaults, fault],
    );

  useEffect(() => {
    const now = faultFields(order);
    setDraft((d) => {
      const next = { ...now };
      for (const key of touched.current) Object.assign(next, { [key]: d[key] });
      return next;
    });
    // A new version of the order (after a reload) refreshes the untouched fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.updatedAt]);

  const save = async () => {
    setState("saving");
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...changes(draft, touched.current), expectedUpdatedAt: order.updatedAt }),
      });
      if (res.status === 409) {
        setProblem(await errorMessage(res, "Otra persona ha cambiado esta orden mientras la editabas."));
        setState("conflict");
        return;
      }
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha guardado la avería."));
        setState("idle");
        return;
      }
      onDirty(false);
      onSaved();
    } catch {
      setProblem("No se ha guardado la avería. Comprueba la conexión.");
      setState("idle");
    }
  };

  return (
    <EditForm
      label="Editar avería"
      saving={state === "saving"}
      problem={problem}
      conflict={state === "conflict"}
      onReload={() => {
        setState("idle");
        setProblem(null);
        onReload();
      }}
      onCancel={() => {
        onDirty(false);
        onCancel();
      }}
      onSubmit={save}
    >
      <fieldset className={styles.group}>
        <legend className={styles.label}>Avería declarada</legend>
        <div className={styles.chips}>
          {Object.entries(FAULT_LABEL).map(([fault, name]) => (
            <label key={fault} className={styles.chip}>
              <input type="checkbox" checked={draft.reportedFaults.includes(fault)} onChange={() => toggle(fault)} />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <Text id="edit-fault-notes" label="Lo que cuenta el cliente" value={draft.faultNotes} onChange={(v) => set("faultNotes", v)} />
      <Text id="edit-condition" label="Estado físico" value={draft.physicalCondition} onChange={(v) => set("physicalCondition", v)} />
      <Text id="edit-accessories" label="Accesorios que deja" value={draft.accessories} onChange={(v) => set("accessories", v)} />
      <Text id="edit-observations" label="Observaciones" value={draft.observations} onChange={(v) => set("observations", v)} />
      <fieldset className={styles.group}>
        <legend className={styles.label}>Prioridad</legend>
        <div className={styles.chips} role="radiogroup">
          {PRIORITIES.map((p) => (
            <label key={p} className={styles.chip}>
              <input type="radio" name="edit-priority" checked={draft.priority === p} onChange={() => set("priority", p)} />
              {PRIORITY_LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>
    </EditForm>
  );
}

/** The client's contact data; it changes them on every order of the client. */
export function ClientEditForm({
  order,
  onDirty,
  onSaved,
  onCancel,
}: {
  order: OrderDetail;
  onDirty: (dirty: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { client } = order;
  const [draft, setDraft] = useState({
    firstName: client.firstName,
    lastName: client.lastName ?? "",
    phoneNumber: client.phoneNumber ?? "",
    email: client.email ?? "",
    preferredContact: client.preferredContact,
  });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    onDirty(true);
  };

  const save = async () => {
    if (!draft.firstName.trim()) {
      setProblem("Escribe el nombre del cliente.");
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: draft.firstName.trim(),
          lastName: textOrNull(draft.lastName),
          phoneNumber: textOrNull(draft.phoneNumber),
          email: textOrNull(draft.email),
          preferredContact: draft.preferredContact,
        }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha guardado el cliente."));
        return;
      }
      onDirty(false);
      onSaved();
    } catch {
      setProblem("No se ha guardado el cliente. Comprueba la conexión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditForm
      label="Editar cliente"
      saving={saving}
      problem={problem}
      onCancel={() => {
        onDirty(false);
        onCancel();
      }}
      onSubmit={save}
    >
      <Text id="edit-first-name" label="Nombre" value={draft.firstName} max={100} onChange={(v) => set("firstName", v)} />
      <Text id="edit-last-name" label="Apellidos" value={draft.lastName} max={100} onChange={(v) => set("lastName", v)} />
      <Text id="edit-phone" label="Teléfono" type="tel" value={draft.phoneNumber} max={30} onChange={(v) => set("phoneNumber", v)} />
      <Text id="edit-email" label="Email" type="email" value={draft.email} max={150} onChange={(v) => set("email", v)} />
      <fieldset className={styles.group}>
        <legend className={styles.label}>Cómo prefiere que le avisen</legend>
        <div className={styles.chips} role="radiogroup">
          {CONTACTS.map((c) => (
            <label key={c} className={styles.chip}>
              <input
                type="radio"
                name="edit-contact"
                checked={draft.preferredContact === c}
                onChange={() => set("preferredContact", c)}
              />
              {CONTACT_LABEL[c].replace("prefiere ", "")}
            </label>
          ))}
        </div>
      </fieldset>
      <p className={styles.hint}>Cambia sus datos en todas sus órdenes. DNI y dirección, en la ficha del cliente.</p>
    </EditForm>
  );
}
