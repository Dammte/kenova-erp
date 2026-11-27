"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { FAULT_LABEL } from "@/components/orders/orderList";
import { ClientPicker } from "./ClientPicker";
import { DevicePicker } from "./DevicePicker";
import { ImeiWarning } from "./ImeiWarning";
import { useAuth } from "@/components/auth/AuthProvider";
import { ServicePicker } from "./ServicePicker";
import {
  ACCESSORY_CHIPS,
  CONDITION_CHIPS,
  EMPTY_DEVICE,
  EMPTY_DRAFT,
  FAULTS,
  PRIORITIES,
  STEPS,
  blocksDone,
  fromQuote,
  intakePayload,
  isKnown,
  missing,
  newLine,
  orderTotal,
  shortName,
  stepOf,
  suggestedServices,
  toggleWord,
  type FoundClient,
  type IntakeState,
  type PricedService,
  type QuoteForIntake,
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
  lines: [],
  draft: EMPTY_DRAFT,
  deposit: null,
  waivesQuote: false,
  method: null,
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

function Block({
  n,
  title,
  children,
  field,
  done = false,
  hidden = false,
}: {
  n: number;
  title: string;
  children: ReactNode;
  field?: string;
  /** Design R3 3.5: the number turns into ✓ once the block is complete. */
  done?: boolean;
  /** Mobile steps: a block of another step is hidden, but keeps what was typed. */
  hidden?: boolean;
}) {
  return (
    <section
      className={`${styles.block} ${hidden ? styles.offStep : ""}`}
      aria-labelledby={`intake-${n}`}
      data-field={field}
    >
      <h2 id={`intake-${n}`} className={styles.blockTitle} tabIndex={-1}>
        <span className={`${styles.step} ${done ? styles.stepDone : ""}`} aria-hidden>
          {done ? <Check size={14} /> : n}
        </span>
        {title}
        {done && <span className={styles.srOnly}> · completo</span>}
      </h2>
      {children}
    </section>
  );
}

const fullName = (c: { firstName: string; lastName: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ").trim();

/** One line per card of the summary, or «—» while it is still empty. */
function summaryOf(s: IntakeState) {
  const client = s.client ? fullName(s.client) || s.client.phoneNumber || "" : "";
  const device = s.device ? `${s.device.brand} ${s.device.model}`.trim() : "";
  const fault = s.faults.length ? s.faults.map((f) => FAULT_LABEL[f] ?? f).join(", ") : s.faultNotes.trim();
  return { client: client || "—", device: device || "—", fault: fault || "—" };
}

/** «Más detalles» folded: what it holds, or what was filled in. */
function detailsLine(s: IntakeState) {
  const filled = [
    s.physicalCondition.trim(),
    s.accessories.trim(),
    s.priority !== "medium" ? `prioridad ${PRIORITIES.find(([p]) => p === s.priority)?.[1].toLowerCase()}` : "",
    s.observations.trim() ? "con observaciones" : "",
  ].filter(Boolean);
  return filled.length ? filled.join(" · ") : "estado físico y accesorios · prioridad media · observaciones";
}

/**
 * Design 1.3: the whole intake on one screen. Client, device and fault are
 * enough to create the order; the rest is optional and can wait.
 */
export function IntakeForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [s, setS] = useState<IntakeState>(START);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Design R3 3.5: rarely used in the intake, so folded; a quote asks to fill them.
  const [details, setDetails] = useState(false);
  // Design R3 3.5: on the phone the intake goes one step at a time (CSS shows it only there).
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (patch: Partial<IntakeState>) => setS((prev) => ({ ...prev, ...patch }));

  // «Dar de alta» from the price list opens /ordenes/nueva?servicio=<id>: the rate comes in.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("servicio");
    if (!id) return;
    const controller = new AbortController();
    apiFetch(`${API_URL}/services/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const rate = (await res.json()) as PricedService;
        setS((prev) =>
          prev.lines.some((l) => l.description === rate.name)
            ? prev
            : { ...prev, lines: [...prev.lines, newLine(rate.name, Number(rate.price))] },
        );
      })
      .catch(() => {
        // The rate is a shortcut; without it the intake works the same.
      });
    return () => controller.abort();
  }, []);

  // «Nueva alta para este cliente» on a client's card opens /ordenes/nueva?cliente=<id>.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("cliente");
    if (!id) return;
    const controller = new AbortController();
    apiFetch(`${API_URL}/clients/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const c = (await res.json()) as FoundClient;
        const client: FoundClient = {
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          phoneNumber: c.phoneNumber,
          dniType: c.dniType,
          dni: c.dni,
        };
        setS((prev) => (prev.client ? prev : withClient(prev, client)));
      })
      .catch(() => {
        // Without it the client is searched as usual.
      });
    return () => controller.abort();
  }, []);

  // «Convertir en orden» opens /ordenes/nueva?presupuesto=<id> (decision: prefilled intake).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("presupuesto");
    if (!id) return;
    const controller = new AbortController();
    const get = async <T,>(url: string): Promise<T> => {
      const res = await apiFetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    };
    (async () => {
      const quote = await get<QuoteForIntake>(`${API_URL}/quotes/${encodeURIComponent(id)}`);
      const phone = quote.clientPhone.replace(/\D/g, "");
      // A client with exactly that phone is reused instead of creating a twin.
      const found = await get<FoundClient[]>(`${API_URL}/clients/search?q=${phone}`).catch(() => []);
      const same = found.filter((c) => (c.phoneNumber ?? "").replace(/\D/g, "") === phone);
      setS((prev) => fromQuote(prev, quote, same.length === 1 ? same[0] : null));
      setDetails(true);
    })().catch(() => {
      if (!controller.signal.aborted) setProblem("No se ha podido cargar el presupuesto. Puedes dar de alta igualmente.");
    });
    return () => controller.abort();
  }, []);
  const todo = missing(s);
  const done = blocksDone(s, todo);
  const summary = summaryOf(s);
  const total = orderTotal(s);
  const deposit = Math.min(s.deposit ?? 0, total);
  const blocked = todo.length === 0 ? undefined : todo.length === 1 ? "Falta 1 dato" : `Faltan ${todo.length} datos`;
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
      // «creada» puts the focus on «Imprimir resguardo»: one Enter prints it.
      router.push(`/ordenes?orden=${order.id}&creada=1`);
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

  /** Goes to a step and, by default, puts the focus on its title. */
  const goTo = (next: number, focusTitle = true) => {
    setStep(next);
    formRef.current?.scrollIntoView?.({ block: "start" });
    if (focusTitle)
      requestAnimationFrame(() => document.getElementById(next === 4 ? "intake-summary" : `intake-${next + 1}`)?.focus());
  };

  /** A «Falta» line opens the step of its field (on the phone) and focuses it. */
  const fix = (field: string) => {
    setStep(stepOf(field));
    requestAnimationFrame(() => focusField(field));
  };

  // What the earlier steps chose, as chips above the current one.
  const chips = [
    step > 0 && s.client ? { step: 0, label: shortName(s.client) || "Cliente nuevo" } : null,
    step > 1 && (s.device?.model.trim() || s.device?.brand.trim())
      ? { step: 1, label: s.device.model.trim() || s.device.brand.trim() }
      : null,
    step > 2 && summary.fault !== "—" ? { step: 2, label: summary.fault } : null,
  ].filter((c): c is { step: number; label: string } => c !== null);

  const toggleFault = (f: string) =>
    set({ faults: s.faults.includes(f) ? s.faults.filter((x) => x !== f) : [...s.faults, f] });

  return (
    <form ref={formRef} className={styles.page} onSubmit={submit} onKeyDown={onKey} aria-label="Nueva orden">
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Nueva orden</h1>
        <span className={styles.stepCount}>
          {step + 1} de {STEPS.length}
        </span>
      </div>
      <nav className={styles.stepNav} aria-label="Pasos">
        <ol className={styles.stepBar}>
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                className={`${styles.stepTab} ${i <= step ? styles.stepTabReached : ""}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => goTo(i)}
              >
                {label}
              </button>
            </li>
          ))}
        </ol>
        {chips.length > 0 && (
          <ul className={styles.stepChips} aria-label="Elegido">
            {chips.map((c) => (
              <li key={c.step}>
                <button type="button" className={styles.stepChip} onClick={() => goTo(c.step)}>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
      {s.quote && (
        <p role="status" className={styles.fromQuote}>
          Desde el presupuesto {s.quote.code}: completa desbloqueo, accesorios y estado. Al crear la orden, el
          presupuesto queda aceptado.
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.blocks}>
          <Block n={1} title="Cliente" done={done.client} hidden={step !== 0}>
            <ClientPicker value={s.client} onChange={(client) => setS((prev) => withClient(prev, client))} />
          </Block>

          <Block n={2} title="Equipo" field="device" done={done.device} hidden={step !== 1}>
            <DevicePicker
              clientId={knownClientId}
              value={s.device}
              // Another device is not the one under warranty.
              onChange={(device) => set({ device, warrantyOf: null })}
            />
            {s.warrantyOf ? (
              <p className={styles.warrantyClaim} role="status">
                Garantía de {s.warrantyOf.code}
                <button type="button" className={styles.link} onClick={() => set({ warrantyOf: null })}>
                  Quitar, es otra avería
                </button>
              </p>
            ) : (
              s.device?.imei && (
                <ImeiWarning
                  imei={s.device.imei}
                  partner={user?.role === "SUPER_ADMIN"}
                  onWarranty={(d) => set({ warrantyOf: { id: d.id, code: d.code } })}
                />
              )
            )}
          </Block>

          <Block n={3} title="Avería" field="faults" done={done.faults} hidden={step !== 2}>
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
                <span className={styles.muted}>
                  ·{" "}
                  {s.faults.includes("other")
                    ? "describe «Otro»"
                    : s.faults.length
                      ? "opcional"
                      : "o marca un síntoma"}
                </span>
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

          <Block n={4} title="Servicios y precio" done={done.services} hidden={step !== 3}>
            <ServicePicker value={s} suggested={suggestedServices(s.faults)} onChange={set} />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={s.waivesQuote}
                onChange={(e) => set({ waivesQuote: e.target.checked })}
              />
              El cliente renuncia al presupuesto previo
              <span className={styles.muted}>· el resguardo lo indica en lugar de «presupuesto válido 30 días»</span>
            </label>
          </Block>

          <details
            className={`${styles.more} ${step !== 4 ? styles.offStep : ""}`}
            open={details}
            onToggle={(e) => setDetails((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className={styles.moreSummary}>
              <span className={styles.blockTitle}>Más detalles</span>
              <span className={styles.muted}>{detailsLine(s)}</span>
            </summary>
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
          </details>
        </div>

        <aside className={`${styles.summary} ${step === 4 ? styles.review : ""}`} aria-label="Resumen">
          <h2 id="intake-summary" className={styles.summaryTitle} tabIndex={-1}>
            Resumen
          </h2>
          <dl className={styles.summaryCards}>
            <div>
              <dt>Cliente</dt>
              <dd>{summary.client}</dd>
            </div>
            <div>
              <dt>Equipo</dt>
              <dd>{summary.device}</dd>
            </div>
            <div>
              <dt>Avería</dt>
              <dd>{summary.fault}</dd>
            </div>
          </dl>
          <dl className={styles.summaryMoney}>
            <div>
              <dt>Total</dt>
              <dd>{formatEur(total)}</dd>
            </div>
            <div>
              <dt>Anticipo</dt>
              <dd>{formatEur(deposit)}</dd>
            </div>
            <div className={styles.pending}>
              <dt>Pendiente</dt>
              <dd>{formatEur(total - deposit)}</dd>
            </div>
          </dl>
          {todo.length > 0 ? (
            <div className={styles.missing}>
              <p className={styles.missingTitle}>Falta</p>
              <ul className={styles.todo}>
                {todo.map((t) => (
                  <li key={t.text}>
                    <button type="button" className={styles.link} onClick={() => fix(t.field)}>
                      {t.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.label}>Todo listo para crear la orden.</p>
          )}
          {problem && (
            <p className={styles.error} role="alert">
              {problem}{" "}
              <button type="button" className={styles.link} onClick={() => void submit()}>
                Reintentar
              </button>
            </p>
          )}
          <div className={styles.submit}>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              loadingText="Creando…"
              disabledReason={blocked}
            >
              Crear orden
            </Button>
          </div>
          <p className={`${styles.muted} ${styles.summaryNote}`}>
            Ctrl + Enter · entra en «En progreso» y se abre con «Imprimir resguardo».
          </p>
        </aside>
      </div>

      <div className={styles.stepFoot}>
        <button
          type="button"
          className={styles.stepBack}
          disabled={step === 0}
          onClick={() => goTo(step - 1)}
        >
          Atrás
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className={styles.stepNext} onClick={() => goTo(step + 1)}>
            Siguiente: {STEPS[step + 1]}
          </button>
        ) : (
          <Button type="submit" variant="primary" loading={saving} loadingText="Creando…" disabledReason={blocked}>
            Crear orden
          </Button>
        )}
      </div>
    </form>
  );
}
