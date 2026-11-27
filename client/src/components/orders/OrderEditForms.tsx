"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, MoneyInput } from "@/components/ui";
import { formatEur } from "@/lib/format";
import { RateSearch } from "@/components/quotes/QuoteForm";
import PatternLock from "@/components/serviceOrders/PatternLock";
import { DEVICE_TYPES, PATTERN_RE, cleanImei } from "@/components/intake/intake";
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
  disabledReason,
}: {
  label: string;
  saving: boolean;
  problem: string | null;
  conflict?: boolean;
  /** Why it cannot be saved yet, such as a missing price. */
  disabledReason?: string;
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
          disabledReason={conflict ? "Recarga primero para ver el otro cambio." : disabledReason}
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

interface DraftLine {
  key: number;
  serviceId: string | null;
  description: string;
  unitPrice: number | null;
  quantity: number;
}

let nextLineKey = 1;
const cents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);

/**
 * «Servicios y piezas»: price, quantity, removing, adding from Tarifas or a
 * line by hand. The total becomes the sum of the lines.
 */
export function LinesEditForm({
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
  onReload: () => void;
}) {
  const adjustment = order.lines
    .filter((l) => l.kind === "adjustment")
    .reduce((sum, l) => sum + cents(l.unitPrice) * l.quantity, 0);
  const [lines, setLines] = useState<DraftLine[]>(() =>
    order.lines
      .filter((l) => l.kind !== "adjustment")
      .map((l) => ({
        key: nextLineKey++,
        serviceId: l.serviceId ?? null,
        description: l.description,
        unitPrice: Number(l.unitPrice),
        quantity: l.quantity,
      })),
  );
  const [state, setState] = useState<Save>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const update = (next: DraftLine[]) => {
    setLines(next);
    onDirty(true);
  };
  const change = (key: number, patch: Partial<DraftLine>) => update(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const total = lines.reduce((sum, l) => sum + cents(l.unitPrice) * l.quantity, 0);
  const paid = cents(order.amountPaid);
  const missing = lines.some((l) => !l.description.trim() || l.unitPrice === null);
  const why = missing
    ? "Cada línea necesita concepto e importe."
    : total < paid
      ? `Ya se han cobrado ${formatEur(paid / 100)}; el total no puede ser menor. Devuelve primero la diferencia.`
      : undefined;

  const save = async () => {
    if (why) return;
    setState("saving");
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editedLines: lines.map((l) => ({
            ...(l.serviceId ? { serviceId: l.serviceId } : {}),
            description: l.description.trim(),
            unitPrice: l.unitPrice,
            quantity: l.quantity,
          })),
          expectedUpdatedAt: order.updatedAt,
        }),
      });
      if (res.status === 409) {
        setProblem(await errorMessage(res, "Otra persona ha cambiado esta orden mientras la editabas."));
        setState("conflict");
        return;
      }
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se han guardado los servicios."));
        setState("idle");
        return;
      }
      onDirty(false);
      onSaved();
    } catch {
      setProblem("No se han guardado los servicios. Comprueba la conexión.");
      setState("idle");
    }
  };

  return (
    <EditForm
      label="Editar servicios y piezas"
      saving={state === "saving"}
      problem={problem}
      conflict={state === "conflict"}
      disabledReason={why}
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
      <RateSearch
        onPick={(r) => {
          const same = lines.find((l) => l.serviceId === r.id);
          if (same) change(same.key, { quantity: Math.min(99, same.quantity + 1) });
          else update([...lines, { key: nextLineKey++, serviceId: r.id, description: r.name, unitPrice: Number(r.price), quantity: 1 }]);
        }}
      />
      {lines.length === 0 && <p className={styles.muted}>Sin líneas: el total será 0,00 €.</p>}
      {lines.map((l, i) => (
        <div key={l.key} className={styles.lineEdit}>
          <span className={styles.lineDesc}>
            <label className={styles.label} htmlFor={`line-${l.key}`}>
              Concepto {i + 1}
              {l.serviceId && <span className={styles.muted}> · de Tarifas</span>}
            </label>
            <input
              id={`line-${l.key}`}
              className={styles.input}
              value={l.description}
              maxLength={150}
              onChange={(e) => change(l.key, { description: e.target.value })}
            />
          </span>
          <span className={styles.lineQty}>
            <label className={styles.label} htmlFor={`qty-${l.key}`}>
              Cantidad {i + 1}
            </label>
            <input
              id={`qty-${l.key}`}
              className={styles.input}
              type="number"
              min={1}
              max={99}
              value={l.quantity}
              onChange={(e) => change(l.key, { quantity: Math.max(1, Math.min(99, Math.trunc(Number(e.target.value) || 1))) })}
            />
          </span>
          <span className={styles.linePrice}>
            <MoneyInput label={`Precio ${i + 1}`} value={l.unitPrice} onChange={(v) => change(l.key, { unitPrice: v })} />
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Quitar ${l.description || `línea ${i + 1}`}`}
            icon={<Trash2 size={16} aria-hidden />}
            onClick={() => update(lines.filter((x) => x.key !== l.key))}
          />
        </div>
      ))}
      <p className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus size={16} aria-hidden />}
          onClick={() => update([...lines, { key: nextLineKey++, serviceId: null, description: "", unitPrice: null, quantity: 1 }])}
        >
          Línea libre
        </Button>
      </p>
      <p className={styles.lineTotalRow}>
        <span>Total</span>
        <strong aria-label="Total de la orden">{formatEur(total / 100)}</strong>
      </p>
      {adjustment !== 0 && (
        <p className={styles.hint}>
          La orden tenía un ajuste de {formatEur(adjustment / 100)}: al guardar, el total pasa a ser la suma de las líneas.
        </p>
      )}
    </EditForm>
  );
}

/** How the device unlocks after saving; «keep» leaves the stored secret as it is. */
type UnlockChoice = "keep" | "none" | "code" | "pattern";
const dots = (s: string) => s.replace(/[^1-9]/g, "").split("").slice(0, 9).join("-");

/**
 * The device block. The device belongs to the client, so a change shows on
 * all their orders. The unlock secret is never shown here: a new one
 * replaces it, «Sin código» removes it.
 */
export function DeviceEditForm({
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
  const device = order.device!;
  const had = device.unlockSecretType;
  const [draft, setDraft] = useState({
    type: device.type,
    brand: device.brand,
    model: device.model,
    imei: device.imei ?? "",
    unlock: (had ? "keep" : "none") as UnlockChoice,
    code: "",
    pattern: "",
  });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    onDirty(true);
  };

  const why = !draft.brand.trim() || !draft.model.trim()
    ? "Escribe la marca y el modelo."
    : draft.unlock === "code" && !draft.code.trim()
      ? "Escribe el PIN o la contraseña."
      : draft.unlock === "pattern" && !PATTERN_RE.test(draft.pattern)
        ? "Dibuja el patrón: 4 puntos como mínimo."
        : undefined;

  const changes = () => {
    const body: Record<string, string | boolean | null> = {};
    if (draft.type !== device.type) body.type = draft.type;
    if (draft.brand.trim() !== device.brand) body.brand = draft.brand.trim();
    if (draft.model.trim() !== device.model) body.model = draft.model.trim();
    const imei = cleanImei(draft.imei);
    if (imei !== (device.imei ?? "")) body.imei = imei || null;
    if (draft.unlock === "code") body.code = draft.code.trim();
    if (draft.unlock === "pattern") body.pattern = draft.pattern;
    if (draft.unlock === "none" && had) body.clearSecret = true;
    return body;
  };

  const save = async () => {
    if (why) return;
    const body = changes();
    if (Object.keys(body).length === 0) {
      onDirty(false);
      onCancel();
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editedDevice: body }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha guardado el equipo."));
        return;
      }
      onDirty(false);
      onSaved();
    } catch {
      setProblem("No se ha guardado el equipo. Comprueba la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const unlocks: [UnlockChoice, string][] = [
    ...(had ? [["keep", had === "PATTERN" ? "Mantener el patrón" : "Mantener el código"] as [UnlockChoice, string]] : []),
    ["none", "Sin código"],
    ["code", "PIN o contraseña"],
    ["pattern", "Patrón"],
  ];

  return (
    <EditForm
      label="Editar equipo"
      saving={saving}
      problem={problem}
      disabledReason={why}
      onCancel={() => {
        onDirty(false);
        onCancel();
      }}
      onSubmit={save}
    >
      <fieldset className={styles.group}>
        <legend className={styles.label}>Tipo</legend>
        <div className={styles.chips} role="radiogroup">
          {DEVICE_TYPES.map(([type, label]) => (
            <label key={type} className={styles.chip}>
              <input type="radio" name="edit-device-type" checked={draft.type === type} onChange={() => set({ type })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Text id="edit-device-brand" label="Marca" value={draft.brand} max={50} onChange={(brand) => set({ brand })} />
      <Text id="edit-device-model" label="Modelo" value={draft.model} max={50} onChange={(model) => set({ model })} />
      <Text id="edit-device-imei" label="IMEI / nº de serie" value={draft.imei} max={25} onChange={(imei) => set({ imei })} />
      <fieldset className={styles.group}>
        <legend className={styles.label}>
          Desbloqueo <span className={styles.muted}>· se guarda cifrado</span>
        </legend>
        <div className={styles.chips} role="radiogroup">
          {unlocks.map(([u, label]) => (
            <label key={u} className={styles.chip}>
              <input type="radio" name="edit-device-unlock" checked={draft.unlock === u} onChange={() => set({ unlock: u })} />
              {label}
            </label>
          ))}
        </div>
        {draft.unlock === "code" && (
          <Text id="edit-device-code" label="PIN o contraseña nuevo" value={draft.code} max={64} onChange={(code) => set({ code })} />
        )}
        {draft.unlock === "pattern" && (
          <>
            <PatternLock value={draft.pattern} onChange={(pattern) => set({ pattern })} />
            <Text id="edit-device-pattern" label="O escribe los puntos, del 1 al 9" value={draft.pattern} max={17} onChange={(p) => set({ pattern: dots(p) })} />
          </>
        )}
        {draft.unlock === "none" && had && <p className={styles.hint}>Al guardar se borra el {had === "PATTERN" ? "patrón" : "código"} guardado.</p>}
      </fieldset>
      <p className={styles.hint}>El equipo es del cliente: el cambio se verá en todas sus órdenes.</p>
    </EditForm>
  );
}
