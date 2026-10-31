"use client";

import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { FAULT_LABEL } from "@/components/orders/orderList";
import { ClientPicker } from "./ClientPicker";
import { DevicePicker } from "./DevicePicker";
import {
  ACCESSORY_CHIPS,
  CONDITION_CHIPS,
  EMPTY_DEVICE,
  FAULTS,
  PRIORITIES,
  intakePayload,
  isKnown,
  missing,
  toggleWord,
  type FoundClient,
  type IntakeState,
} from "./intake";
import styles from "./Intake.module.css";

const START: IntakeState = {
  client: null,
  device: null,
  faults: [],
  faultNotes: "",
  physicalCondition: "",
  accessories: "",
  priority: "medium",
  observations: "",
};

/** Moves to the field a "Falta" line names: an input by name, or a chip block. */
function focusField(field: string) {
  document
    .querySelector<HTMLElement>(`[name="${field}"], [data-field="${field}"] input, [data-field="${field}"] button`)
    ?.focus();
}

/**
 * A different client means a different set of devices. A new client has none,
 * so the device form opens at once; typing in the new client keeps it.
 */
export function withClient(prev: IntakeState, client: IntakeState["client"]): IntakeState {
  let device: IntakeState["device"] = null;
  if (client && !isKnown(client)) device = prev.device && !isKnown(prev.device) ? prev.device : EMPTY_DEVICE;
  else if (client && isKnown<FoundClient>(prev.client) && prev.client.id === client.id) device = prev.device;
  return { ...prev, client, device };
}

function Block({ n, title, children, field }: { n: number; title: string; children: ReactNode; field?: string }) {
  return (
    <section className={styles.block} aria-labelledby={`intake-${n}`} data-field={field}>
      <h2 id={`intake-${n}`} className={styles.blockTitle}>
        <span className={styles.step} aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Design 1.3: the whole intake on one screen. Client, device and fault are
 * enough to create the order; the rest is optional and can wait.
 */
export function IntakeForm() {
  const router = useRouter();
  const [s, setS] = useState<IntakeState>(START);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const set = (patch: Partial<IntakeState>) => setS((prev) => ({ ...prev, ...patch }));
  const todo = missing(s);
  const knownClientId = s.client && isKnown<FoundClient>(s.client) ? s.client.id : null;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (todo.length || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intakePayload(s)),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido crear la orden."));
        return;
      }
      const order = (await res.json()) as { id: string };
      router.push(`/ordenes?orden=${order.id}`);
    } catch {
      setProblem("No se ha podido crear la orden. Comprueba la conexión; los datos siguen aquí.");
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const toggleFault = (f: string) =>
    set({ faults: s.faults.includes(f) ? s.faults.filter((x) => x !== f) : [...s.faults, f] });

  return (
    <form className={styles.page} onSubmit={submit} onKeyDown={onKey} aria-label="Nueva orden">
      <h1 className={styles.title}>Nueva orden</h1>
      <div className={styles.layout}>
        <div className={styles.blocks}>
          <Block n={1} title="Cliente">
            <ClientPicker value={s.client} onChange={(client) => setS((prev) => withClient(prev, client))} />
          </Block>

          <Block n={2} title="Dispositivo" field="device">
            <DevicePicker
              clientId={knownClientId}
              value={s.device}
              onChange={(device) => set({ device })}
            />
          </Block>

          <Block n={3} title="Avería declarada" field="faults">
            <div className={styles.chips}>
              {FAULTS.map((f) => (
                <label key={f} className={styles.chip}>
                  <input type="checkbox" checked={s.faults.includes(f)} onChange={() => toggleFault(f)} />
                  {FAULT_LABEL[f]}
                </label>
              ))}
            </div>
            <label className={styles.group}>
              <span className={styles.label}>
                Lo que cuenta el cliente{" "}
                <span className={styles.muted}>· {s.faults.includes("other") ? "describe «Otro»" : "opcional"}</span>
              </span>
              <textarea
                name="faultNotes"
                className={styles.textarea}
                rows={2}
                maxLength={500}
                value={s.faultNotes}
                onChange={(e) => set({ faultNotes: e.target.value })}
              />
            </label>
          </Block>

          <Block n={4} title="Estado físico y accesorios">
            <div className={styles.grid2}>
              <div className={styles.group}>
                <label className={styles.label} htmlFor="intake-condition">
                  Estado físico
                </label>
                <div className={styles.chips}>
                  {CONDITION_CHIPS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={styles.chip}
                      aria-pressed={s.physicalCondition.split(",").map((p) => p.trim()).includes(w)}
                      onClick={() => set({ physicalCondition: toggleWord(s.physicalCondition, w) })}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <input
                  id="intake-condition"
                  className={styles.input}
                  maxLength={500}
                  placeholder="Sin marcas visibles"
                  value={s.physicalCondition}
                  onChange={(e) => set({ physicalCondition: e.target.value })}
                />
              </div>
              <div className={styles.group}>
                <label className={styles.label} htmlFor="intake-accessories">
                  Accesorios que deja
                </label>
                <div className={styles.chips}>
                  {ACCESSORY_CHIPS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={styles.chip}
                      aria-pressed={s.accessories.split(",").map((p) => p.trim()).includes(w)}
                      onClick={() => set({ accessories: toggleWord(s.accessories, w) })}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <input
                  id="intake-accessories"
                  className={styles.input}
                  maxLength={500}
                  placeholder="Ninguno"
                  value={s.accessories}
                  onChange={(e) => set({ accessories: e.target.value })}
                />
              </div>
            </div>
          </Block>

          <Block n={5} title="Prioridad y observaciones">
            <div className={styles.chips} role="radiogroup" aria-label="Prioridad">
              {PRIORITIES.map(([p, label]) => (
                <label key={p} className={styles.chip}>
                  <input type="radio" name="priority" checked={s.priority === p} onChange={() => set({ priority: p })} />
                  {label}
                </label>
              ))}
            </div>
            <label className={styles.group}>
              <span className={styles.label}>
                Observaciones internas <span className={styles.muted}>· opcional</span>
              </span>
              <textarea
                className={styles.textarea}
                rows={2}
                maxLength={5000}
                value={s.observations}
                onChange={(e) => set({ observations: e.target.value })}
              />
            </label>
          </Block>
        </div>

        <aside className={styles.summary} aria-label="Resumen">
          {todo.length > 0 ? (
            <>
              <p className={styles.label}>Para crear la orden falta</p>
              <ul className={styles.todo}>
                {todo.map((t) => (
                  <li key={t.text}>
                    <button type="button" className={styles.link} onClick={() => focusField(t.field)}>
                      {t.text}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.label}>Todo listo para crear la orden.</p>
          )}
          <p className={styles.muted}>Entra como En progreso. Precio, servicios y cobro se añaden desde la orden.</p>
          {problem && (
            <p className={styles.error} role="alert">
              {problem}{" "}
              <button type="button" className={styles.link} onClick={() => void submit()}>
                Reintentar
              </button>
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            loadingText="Creando…"
            disabledReason={todo.length ? `Falta: ${todo.map((t) => t.text).join(", ")}.` : undefined}
          >
            Crear orden
          </Button>
          <p className={styles.muted}>Ctrl + Enter para crear.</p>
        </aside>
      </div>
    </form>
  );
}
