"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { formatDate } from "./inventory";
import {
  confirmBody,
  initialDecision,
  parseCost,
  parseQty,
  reviewBlocker,
  summary,
  tidyName,
  type Confirmed,
  type Preview,
  type ReadInvoice,
  type ReadLine,
  type ReviewLine,
} from "./invoiceImport";
import styles from "./Inventory.module.css";

const STEPS = ["Subir", "Revisar", "Confirmar", "Resultado"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

interface Head {
  provider: string;
  number: string;
  invoiceDate: string | null;
}

const money = (s: string) => s.replace(".", ",");

/**
 * Design 3.4 «Importar factura»: four visible steps, because it changes the
 * stock of many parts at once. Nothing enters stock before «Confirmar entrada».
 */
export function InvoiceImport({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [head, setHead] = useState<Head>({ provider: "", number: "", invoiceDate: null });
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [duplicate, setDuplicate] = useState<Preview["duplicateOf"]>(null);
  const [again, setAgain] = useState(false);
  const [result, setResult] = useState<Confirmed | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Lines read or typed → their matches → «Revisar». */
  const review = async (h: Head, read: ReadLine[]) => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/purchase-invoices/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: h.provider, number: h.number || null, lines: read }),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se han podido comprobar las líneas."));
        return;
      }
      const preview = (await res.json()) as Preview;
      setHead(h);
      setDuplicate(preview.duplicateOf);
      setAgain(false);
      setLines(
        read.map((l, i) => {
          const { match, waiting } = preview.lines[i];
          return {
            ...l,
            key: i,
            match,
            waiting,
            decision: initialDecision(l, match),
            qtyText: String(l.quantity),
            costText: money(l.unitCost),
          };
        }),
      );
      setStep(2);
    } catch {
      setProblem("No se han podido comprobar las líneas: se ha perdido la conexión.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/purchase-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody(head, lines, again)),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido dar entrada a la factura."));
        if (res.status === 409) setStep(2);
        return;
      }
      setResult((await res.json()) as Confirmed);
      setStep(4);
    } catch {
      setProblem("No se sabe si la entrada se guardó: se ha perdido la conexión. Mira el inventario antes de repetirla.");
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setStep(1);
    setLines([]);
    setResult(null);
    setProblem(null);
  };

  return (
    <div className={styles.import}>
      <ol className={styles.steps} aria-label="Pasos">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined} className={step > i + 1 ? styles.stepDone : undefined}>
            <span className={styles.stepNum}>{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 1 && <Upload busy={busy} onRead={review} problem={problem} setProblem={setProblem} />}

      {step === 2 && (
        <Review
          head={head}
          setHead={setHead}
          lines={lines}
          setLines={setLines}
          duplicate={duplicate}
          again={again}
          setAgain={setAgain}
          problem={problem}
          onCancel={restart}
          onNext={() => {
            setProblem(null);
            setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <Confirm
          head={head}
          lines={lines}
          busy={busy}
          problem={problem}
          onBack={() => setStep(2)}
          onConfirm={confirm}
        />
      )}

      {step === 4 && result && (
        <section className={styles.importCard} aria-label="Resultado">
          <p role="status" className={styles.notice}>
            <strong>Stock actualizado</strong> · {head.number ? `${head.number} · ` : ""}
            {head.provider} · {result.units} {result.units === 1 ? "unidad" : "unidades"} · {formatEur(result.cost)}
          </p>
          <ul className={styles.resultList}>
            {result.lines.map((l, i) => (
              <li key={`${l.inventoryId}-${i}`}>
                {l.created ? "Nuevo: " : ""}
                {l.name} · {l.created ? <strong>{l.stockAfter}</strong> : <>{l.stockBefore} → <strong>{l.stockAfter}</strong></>}
                {l.received.map((o) => (
                  <span key={o.orderId} className={styles.okText}>
                    {" "}
                    · pedido de{" "}
                    <Link href={`/ordenes?orden=${o.orderId}`} className={styles.link}>
                      {o.orderCode}
                    </Link>{" "}
                    recibido
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <div className={styles.importActions}>
            <Button variant="primary" onClick={onDone}>
              Ver inventario
            </Button>
            <Button variant="ghost" onClick={restart}>
              Importar otra factura
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Step 1: the file read with AI, or the lines typed by hand. */
function Upload({
  busy,
  onRead,
  problem,
  setProblem,
}: {
  busy: boolean;
  onRead: (head: Head, lines: ReadLine[]) => void;
  problem: string | null;
  setProblem: (p: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [manual, setManual] = useState(false);

  const read = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setProblem("El archivo no puede pasar de 10 MB.");
      return;
    }
    setReading(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch(`${API_URL}/purchase-invoices/read`, { method: "POST", body: form });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido leer la factura."));
        return;
      }
      const inv = (await res.json()) as ReadInvoice;
      onRead({ provider: inv.provider ?? "", number: inv.number ?? "", invoiceDate: inv.invoiceDate }, inv.lines);
    } catch {
      setProblem("No se ha podido leer la factura: se ha perdido la conexión.");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };

  if (manual) return <ManualLines busy={busy} onSubmit={onRead} onBack={() => setManual(false)} problem={problem} />;

  const drop = (e: DragEvent) => {
    e.preventDefault();
    void read(e.dataTransfer.files[0]);
  };

  return (
    <section className={styles.importCard} aria-label="Subir factura">
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className={styles.hiddenInput}
        aria-label="Archivo de la factura"
        onChange={(e) => void read(e.target.files?.[0])}
      />
      <button
        type="button"
        className={styles.drop}
        disabled={reading || busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={drop}
      >
        <FileUp size={36} aria-hidden />
        <strong>{reading || busy ? "Leyendo la factura…" : "Arrastra aquí el PDF de la factura"}</strong>
        <span className={styles.muted}>o pulsa para elegirlo · máx. 10 MB · también fotos JPG o PNG</span>
        <span className={styles.muted}>Se leen las líneas con IA. Nada entra en stock hasta que lo confirmes.</span>
      </button>
      {problem && (
        <div role="alert" className={styles.error}>
          {problem}
        </div>
      )}
      <p>
        <button type="button" className={styles.linkButton} onClick={() => setManual(true)}>
          Meter las líneas a mano
        </button>
      </p>
    </section>
  );
}

interface Draft {
  key: number;
  description: string;
  ref: string;
  qty: string;
  cost: string;
}
const emptyDraft = (key: number): Draft => ({ key, description: "", ref: "", qty: "1", cost: "" });

function ManualLines({
  busy,
  onSubmit,
  onBack,
  problem,
}: {
  busy: boolean;
  onSubmit: (head: Head, lines: ReadLine[]) => void;
  onBack: () => void;
  problem: string | null;
}) {
  const [head, setHead] = useState<Head>({ provider: "", number: "", invoiceDate: null });
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft(0)]);
  const set = (key: number, patch: Partial<Draft>) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const filled = drafts.filter((d) => d.description.trim());
  const missing = !head.provider.trim()
    ? "Indica el proveedor."
    : filled.length === 0
      ? "Escribe al menos una línea."
      : filled.some((d) => parseQty(d.qty) === null || parseCost(d.cost) === null)
        ? "Revisa cantidades y costes."
        : undefined;

  return (
    <section className={styles.importCard} aria-label="Líneas a mano">
      <HeadFields head={head} setHead={setHead} />
      <table className={`${styles.table} ${styles.reviewTable}`}>
        <thead>
          <tr>
            <th>Descripción</th>
            <th className={styles.wide}>Ref. proveedor</th>
            <th>Cant.</th>
            <th>Coste ud.</th>
            <th aria-label="Quitar" />
          </tr>
        </thead>
        <tbody>
          {drafts.map((d, i) => (
            <tr key={d.key}>
              <td>
                <input className={styles.cellInput} aria-label={`Descripción de la línea ${i + 1}`} maxLength={150} value={d.description} onChange={(e) => set(d.key, { description: e.target.value })} />
              </td>
              <td className={styles.wide}>
                <input className={styles.cellInput} aria-label={`Referencia de la línea ${i + 1}`} maxLength={40} value={d.ref} onChange={(e) => set(d.key, { ref: e.target.value })} />
              </td>
              <td>
                <input className={styles.qtyInput} inputMode="numeric" aria-label={`Cantidad de la línea ${i + 1}`} value={d.qty} onChange={(e) => set(d.key, { qty: e.target.value })} />
              </td>
              <td>
                <input className={styles.qtyInput} inputMode="decimal" aria-label={`Coste de la línea ${i + 1}`} value={d.cost} onChange={(e) => set(d.key, { cost: e.target.value })} />
              </td>
              <td>
                <button type="button" className={styles.close} aria-label={`Quitar la línea ${i + 1}`} onClick={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}>
                  <X size={16} aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button type="button" className={styles.linkButton} onClick={() => setDrafts((d) => [...d, emptyDraft(Math.max(0, ...d.map((x) => x.key)) + 1)])}>
          + Añadir línea
        </button>
      </p>
      {problem && (
        <div role="alert" className={styles.error}>
          {problem}
        </div>
      )}
      <div className={styles.importActions}>
        <Button variant="ghost" onClick={onBack}>
          Volver
        </Button>
        <Button
          variant="primary"
          loading={busy}
          disabledReason={missing}
          onClick={() =>
            onSubmit(
              head,
              filled.map((d) => ({
                description: d.description.trim(),
                ref: d.ref.trim() || null,
                quantity: parseQty(d.qty)!,
                unitCost: parseCost(d.cost)!,
              })),
            )
          }
        >
          Revisar líneas
        </Button>
      </div>
    </section>
  );
}

function HeadFields({ head, setHead }: { head: Head; setHead: (h: Head) => void }) {
  return (
    <div className={styles.headFields}>
      <label>
        Proveedor
        <input className={styles.cellInput} maxLength={50} value={head.provider} onChange={(e) => setHead({ ...head, provider: e.target.value })} />
      </label>
      <label>
        Nº de factura
        <input className={styles.cellInput} maxLength={40} value={head.number} onChange={(e) => setHead({ ...head, number: e.target.value })} />
      </label>
      <label>
        Fecha
        <input type="date" className={styles.cellInput} value={head.invoiceDate ?? ""} onChange={(e) => setHead({ ...head, invoiceDate: e.target.value || null })} />
      </label>
    </div>
  );
}

const pct = (score: number) => `${Math.round(score * 100)} %`;

/** Step 2: each line against the stock; similar ones need a decision. */
function Review({
  head,
  setHead,
  lines,
  setLines,
  duplicate,
  again,
  setAgain,
  problem,
  onCancel,
  onNext,
}: {
  head: Head;
  setHead: (h: Head) => void;
  lines: ReviewLine[];
  setLines: (f: (l: ReviewLine[]) => ReviewLine[]) => void;
  duplicate: Preview["duplicateOf"];
  again: boolean;
  setAgain: (v: boolean) => void;
  problem: string | null;
  onCancel: () => void;
  onNext: () => void;
}) {
  const set = (key: number, patch: Partial<ReviewLine>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const count = (k: string) => lines.filter((l) => l.match.kind === k).length;
  const blocker = reviewBlocker(lines, Boolean(duplicate), again) ?? (head.provider.trim() ? undefined : "Indica el proveedor.");

  return (
    <section className={styles.importCard} aria-label="Revisar líneas">
      <HeadFields head={head} setHead={setHead} />
      <p className={styles.muted}>
        {lines.length} {lines.length === 1 ? "línea" : "líneas"} · {count("match")} coinciden · {count("similar")} similares ·{" "}
        {count("new")} {count("new") === 1 ? "nuevo" : "nuevos"}
      </p>
      {duplicate && (
        <div role="alert" className={styles.warnBox}>
          La factura {head.number} ya se importó el {formatDate(duplicate.importedAt.slice(0, 10))}
          {duplicate.by ? ` (${duplicate.by})` : ""}. ¿Importarla otra vez?
          <label className={styles.inlineCheck}>
            <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> Sí, es otra entrada
          </label>
        </div>
      )}
      <table className={`${styles.table} ${styles.reviewTable}`}>
        <thead>
          <tr>
            <th>Línea de la factura</th>
            <th>En Kenova</th>
            <th>Cant.</th>
            <th>Coste ud.</th>
            <th aria-label="Ignorar" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className={l.decision.to === "undecided" ? styles.similarRow : undefined}>
              <td>
                <span className={styles.raw}>{l.description}</span>
                {l.ref && <span className={`${styles.muted} ${styles.sub}`}>{l.ref}</span>}
              </td>
              <td>
                <MatchCell line={l} set={(patch) => set(l.key, patch)} />
              </td>
              <td>
                <input
                  className={styles.qtyInput}
                  inputMode="numeric"
                  aria-label={`Cantidad de ${l.description}`}
                  aria-invalid={parseQty(l.qtyText) === null}
                  value={l.qtyText}
                  onChange={(e) => set(l.key, { qtyText: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={styles.qtyInput}
                  inputMode="decimal"
                  aria-label={`Coste de ${l.description}`}
                  aria-invalid={parseCost(l.costText) === null}
                  value={l.costText}
                  onChange={(e) => set(l.key, { costText: e.target.value })}
                />
              </td>
              <td>
                <button type="button" className={styles.close} aria-label={`Ignorar ${l.description}`} onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))}>
                  <X size={16} aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {problem && (
        <div role="alert" className={styles.error}>
          {problem}
        </div>
      )}
      <div className={styles.importActions}>
        {!blocker && <span className={styles.muted}>Todo listo para revisar la entrada.</span>}
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" disabledReason={blocker} onClick={onNext}>
          Revisar entrada
        </Button>
      </div>
    </section>
  );
}

function MatchCell({ line, set }: { line: ReviewLine; set: (patch: Partial<ReviewLine>) => void }) {
  const { decision, match } = line;
  const asNew = () => set({ decision: { to: "new", name: tidyName(line.description) } });
  if (decision.to === "part") {
    const waiting = line.waiting.length;
    return (
      <>
        <span className={`${styles.kind} ${styles.kindMatch}`}>Coincide con</span>{" "}
        {decision.part.name} <span className={styles.muted}>· {decision.part.sku} · stock {decision.part.stock}</span>
        {waiting > 0 && (
          <span className={`${styles.sub} ${styles.okText}`}>
            {waiting} {waiting === 1 ? "orden esperando" : "órdenes esperando"}: {line.waiting.map((w) => w.orderCode).join(", ")}
          </span>
        )}
        <span className={styles.sub}>
          <button type="button" className={styles.linkButton} onClick={asNew}>
            No es este: crear como nuevo
          </button>
        </span>
      </>
    );
  }
  if (decision.to === "new") {
    return (
      <>
        <span className={`${styles.kind} ${styles.kindNew}`}>Nuevo</span> se creará como
        <input
          className={styles.cellInput}
          aria-label={`Nombre del repuesto nuevo para ${line.description}`}
          maxLength={100}
          value={decision.name}
          onChange={(e) => set({ decision: { to: "new", name: e.target.value } })}
        />
        {match.kind === "similar" && (
          <button type="button" className={styles.linkButton} onClick={() => set({ decision: { to: "undecided" } })}>
            Volver a la sugerencia
          </button>
        )}
      </>
    );
  }
  if (match.kind !== "similar") return null;
  return (
    <>
      <span className={`${styles.kind} ${styles.kindSimilar}`}>Similar a… · revisar</span> ¿{match.part.name}{" "}
      <span className={styles.muted}>· {match.part.sku}</span>? ({pct(match.score)})
      <span className={styles.choiceRow}>
        <Button size="sm" onClick={() => set({ decision: { to: "part", part: match.part } })}>
          Es este
        </Button>
        <Button size="sm" variant="ghost" onClick={asNew}>
          Crear como nuevo
        </Button>
      </span>
    </>
  );
}

/** Step 3: what will change, before anything does. */
function Confirm({
  head,
  lines,
  busy,
  problem,
  onBack,
  onConfirm,
}: {
  head: Head;
  lines: ReviewLine[];
  busy: boolean;
  problem: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const s = summary(lines);
  // The units of each line cover its part orders oldest first, as the server does.
  const covered = lines.flatMap((l) => {
    if (l.decision.to !== "part") return [];
    let left = parseQty(l.qtyText) ?? 0;
    return l.waiting.filter((w) => (w.quantity <= left ? ((left -= w.quantity), true) : false)).map((w) => ({ ...w, name: l.decision.to === "part" ? l.decision.part.name : "" }));
  });
  return (
    <section className={styles.importCard} aria-label="Confirmar entrada">
      <h2 className={styles.sectionTitle}>Confirmar entrada de stock</h2>
      <p className={styles.muted}>
        {head.provider}
        {head.number ? ` · factura ${head.number}` : ""}
        {head.invoiceDate ? ` · ${formatDate(head.invoiceDate)}` : ""}
      </p>
      <dl className={styles.facts}>
        <dt>Repuestos que suben de stock</dt>
        <dd>{s.raised}</dd>
        <dt>Repuestos nuevos que se crean</dt>
        <dd>{s.created}</dd>
        <dt>Unidades en total</dt>
        <dd>{s.units}</dd>
        <dt>Coste total (sin IVA)</dt>
        <dd>{formatEur(s.cost)}</dd>
      </dl>
      <p className={styles.muted}>El coste de cada repuesto pasa a ser la media ponderada entre lo que había y lo que entra.</p>
      {covered.map((w) => (
        <p key={w.partOrderId} className={styles.infoBox}>
          Esta factura cubre el pedido de <strong>{w.name}</strong> para {w.orderCode}. Se marcará como recibido.
        </p>
      ))}
      {problem && (
        <div role="alert" className={styles.error}>
          {problem}
        </div>
      )}
      <div className={styles.importActions}>
        <Button variant="ghost" onClick={onBack}>
          Volver a revisar
        </Button>
        <Button variant="primary" loading={busy} onClick={onConfirm}>
          Confirmar entrada
        </Button>
      </div>
    </section>
  );
}
