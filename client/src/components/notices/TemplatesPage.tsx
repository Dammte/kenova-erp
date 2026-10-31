"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import {
  SAMPLE_ORDER,
  TEMPLATE_LONG,
  TEMPLATE_VARIABLES,
  renderTemplate,
  sampleValues,
  templateProblem,
  templateWarnings,
  type MessageTemplate,
  type TemplateTrigger,
} from "./notices";
import styles from "./Templates.module.css";

const storesText = (n: number) => (n === 1 ? "1 tienda" : `${n} tiendas`);

interface StoreOption {
  id: string;
  name: string;
  isMain?: boolean;
  isActive?: boolean;
}

/** The stores a partner can choose, the workshop first; a store account only its own. */
function useStores(storeId: string | null) {
  const [stores, setStores] = useState<StoreOption[]>([]);
  useEffect(() => {
    let live = true;
    apiFetch(storeId ? `${API_URL}/stores/${storeId}` : `${API_URL}/stores`)
      .then(async (res) => (res.ok ? ((await res.json()) as StoreOption | StoreOption[]) : []))
      .then((data) => {
        if (!live) return;
        const list = (Array.isArray(data) ? data : [data]).filter((s) => s.isActive !== false);
        setStores(list.sort((a, b) => Number(Boolean(b.isMain)) - Number(Boolean(a.isMain))));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [storeId]);
  return stores;
}

/**
 * Design 2.5: the WhatsApp texts a store sends. The list of notices on the
 * left, the open one on the right with a live preview on example data.
 */
export function TemplatesPage() {
  const { user } = useAuth();
  const isPartner = user?.role === "SUPER_ADMIN";
  const stores = useStores(isPartner ? null : (user?.storeId ?? null));
  const [storeId, setStoreId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState<TemplateTrigger>("ready");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!storeId && stores.length > 0) setStoreId(stores[0].id);
  }, [stores, storeId]);

  useEffect(() => {
    if (!storeId) return;
    let live = true;
    const qs = isPartner ? `?storeId=${storeId}` : "";
    apiFetch(`${API_URL}/message-templates${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) {
          setTemplates((await res.json()) as MessageTemplate[]);
          setFailed(false);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [storeId, isPartner, reload]);

  const store = stores.find((s) => s.id === storeId);
  const open = templates?.find((t) => t.trigger === current);

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <h1 className={styles.title}>Plantillas</h1>
          <p className={styles.muted}>Los textos de WhatsApp que se envían al cliente desde la orden.</p>
        </div>
        {isPartner && stores.length > 1 && (
          <label className={styles.store}>
            Tienda
            <select value={storeId ?? ""} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {failed && (
        <p role="alert" className={styles.error}>
          No se han podido cargar las plantillas. Prueba otra vez.
        </p>
      )}

      {templates && (
        <div className={styles.split}>
          <nav aria-label="Avisos">
            <ul className={styles.list}>
              {templates.map((t) => (
                <li key={t.trigger}>
                  <button
                    type="button"
                    className={styles.row}
                    aria-current={t.trigger === current ? "true" : undefined}
                    onClick={() => setCurrent(t.trigger)}
                  >
                    <span className={styles.rowHead}>
                      <strong>{t.name}</strong>
                      {!t.isBase && <span className={styles.own}>Propia</span>}
                    </span>
                    <span className={styles.muted}>{t.when}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {open && storeId && (
            <TemplateEditor
              key={`${storeId}:${open.trigger}:${open.body}`}
              template={open}
              storeId={storeId}
              storeName={store?.name ?? "Kenova"}
              isPartner={isPartner}
              otherStores={stores.length - 1}
              onSaved={() => setReload((n) => n + 1)}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  template: MessageTemplate;
  storeId: string;
  storeName: string;
  isPartner: boolean;
  otherStores: number;
  onSaved: () => void;
}

function TemplateEditor({ template, storeId, storeName, isPartner, otherStores, onSaved }: EditorProps) {
  const [body, setBody] = useState(template.body);
  const [busy, setBusy] = useState<"save" | "restore" | "copy" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"restore" | "copy" | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const invalid = templateProblem(body);
  const warnings = invalid ? [] : templateWarnings(body, storeName);
  const preview = invalid ? null : renderTemplate(body, sampleValues(storeName));
  const changed = body !== template.body;
  const url = `${API_URL}/message-templates/${template.trigger}`;
  const store = isPartner ? { storeId } : {};

  const insert = (name: string) => {
    const el = area.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const call = async (kind: "save" | "restore" | "copy", init: RequestInit, target: string, ok: string) => {
    setBusy(kind);
    setProblem(null);
    setDone(null);
    setConfirm(null);
    try {
      const res = await apiFetch(target, {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar. Prueba otra vez."));
        return;
      }
      const data = (await res.json()) as { stores?: number };
      setDone(kind === "copy" ? `Copiada a ${storesText(data.stores ?? 0)}.` : ok);
      if (kind !== "copy") onSaved();
    } catch {
      setProblem("No se ha podido guardar. Prueba otra vez.");
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    call("save", { method: "PUT", body: JSON.stringify({ body, ...store }) }, url, "Plantilla guardada.");
  const restore = () =>
    call("restore", { method: "DELETE" }, isPartner ? `${url}?storeId=${storeId}` : url, "Plantilla base restaurada.");
  const copy = () =>
    call("copy", { method: "POST", body: JSON.stringify(store) }, `${url}/copy-to-all`, "");

  return (
    <section className={styles.editor} aria-label={`Plantilla ${template.name}`}>
      <div className={styles.editorHead}>
        <h2>{template.name}</h2>
        <p className={styles.muted}>
          {template.when} · WhatsApp
          {template.updatedBy && ` · cambiada por ${template.updatedBy.fullName}`}
        </p>
      </div>

      <div className={styles.chips} role="group" aria-label="Insertar variable">
        {TEMPLATE_VARIABLES.map((v) => (
          <button key={v} type="button" className={styles.chip} onClick={() => insert(v)}>
            {`{${v}}`}
          </button>
        ))}
      </div>
      <textarea
        ref={area}
        className={styles.textarea}
        aria-label="Texto del aviso"
        aria-invalid={invalid ? "true" : undefined}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <p className={styles.muted}>
        Usa [si saldo]…[/si] para lo que solo debe salir si queda algo por pagar.
      </p>
      {invalid && (
        <p role="alert" className={styles.error}>
          {invalid}
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className={styles.warning}>
          {w}
        </p>
      ))}

      {preview !== null && (
        <div className={styles.preview}>
          <p className={styles.muted}>Vista previa con {SAMPLE_ORDER}</p>
          <p className={styles.bubble} aria-label="Vista previa">
            {preview}
          </p>
          <p className={styles.muted}>
            {preview.length} caracteres con datos de ejemplo
            {preview.length > TEMPLATE_LONG && " · largo"}
          </p>
        </div>
      )}

      {problem && (
        <p role="alert" className={styles.error}>
          {problem}
        </p>
      )}
      {done && <p role="status">{done}</p>}

      {confirm === "restore" && (
        <div className={styles.confirm}>
          <p>¿Volver al texto base? Se pierde el texto propio de esta tienda.</p>
          <Button variant="danger" size="sm" onClick={restore}>
            Restaurar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
        </div>
      )}
      {confirm === "copy" && (
        <div className={styles.confirm}>
          <p>
            {otherStores === 1
              ? "¿Usar este texto también en la otra tienda? Sustituye el que tenga."
              : `¿Usar este texto en las otras ${otherStores} tiendas? Sustituye el que tengan.`}
          </p>
          <Button variant="primary" size="sm" onClick={copy}>
            Copiar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
        </div>
      )}

      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={save}
          loading={busy === "save"}
          disabledReason={invalid ? "Corrige el texto" : !changed ? "Sin cambios" : undefined}
        >
          Guardar
        </Button>
        {changed && (
          <Button variant="ghost" onClick={() => setBody(template.body)}>
            Descartar cambios
          </Button>
        )}
        {!template.isBase && !changed && (
          <Button variant="secondary" loading={busy === "restore"} onClick={() => setConfirm("restore")}>
            Restaurar plantilla base
          </Button>
        )}
        {isPartner && otherStores > 0 && (
          <Button
            variant="secondary"
            loading={busy === "copy"}
            disabledReason={changed ? "Guarda antes de copiar" : undefined}
            onClick={() => setConfirm("copy")}
          >
            Copiar a todas las tiendas
          </Button>
        )}
      </div>
    </section>
  );
}
