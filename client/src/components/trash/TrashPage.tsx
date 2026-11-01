"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import {
  KIND_LABEL,
  KINDS,
  TRASH_PAGE_SIZE,
  deletedLine,
  listUrl,
  openHref,
  restoredText,
  type TrashItem,
  type TrashKind,
  type TrashPage as Page,
} from "./trash";
import styles from "./Trash.module.css";

/** Design R2 3.10: partners only, like the menu entry. */
export function TrashPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>
            <strong>Sin permiso.</strong> La papelera la gestionan los socios.
          </p>
          <Link href="/panel" className={styles.link}>
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }
  return <Trash />;
}

function Trash() {
  const [kind, setKind] = useState<TrashKind | null>(null);
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [restored, setRestored] = useState<TrashItem | null>(null);

  // The search waits until typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(typed);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(listUrl(kind, q, page))
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Page;
        if (live) setData(body);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [kind, q, page, reload]);

  const restore = async (item: TrashItem) => {
    setBusy(item.id);
    setProblem(null);
    setRestored(null);
    try {
      const res = await apiFetch(
        `${API_URL}/trash/${item.kind}/${item.id}/restore`,
        { method: "POST" },
      );
      if (!res.ok) {
        setProblem(
          await errorMessage(res, `No se ha podido restaurar ${item.title}.`),
        );
      } else {
        setRestored(item);
      }
    } catch {
      setProblem(
        `No se ha podido restaurar ${item.title}: revisa la conexión y vuelve a intentarlo.`,
      );
    } finally {
      setBusy(null);
      setReload((n) => n + 1);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / TRASH_PAGE_SIZE)) : 1;
  const filtered = kind !== null || q.trim() !== "";

  return (
    <section className={styles.page} aria-label="Papelera">
      <div className={styles.top}>
        <h1 className={styles.title}>Papelera</h1>
        <input
          type="search"
          className={styles.search}
          placeholder="Buscar por número, nombre o SKU…"
          aria-label="Buscar en la papelera"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      <div className={styles.filters} role="group" aria-label="Tipo">
        {[[null, "Todo"] as const, ...KINDS].map(([k, label]) => (
          <button
            key={label}
            type="button"
            className={styles.filter}
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {restored && (
        <p className={styles.ok} role="status">
          {restoredText(restored)}{" "}
          <Link href={openHref(restored)} className={styles.link}>
            Abrir
          </Link>
        </p>
      )}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}

      {failed && !data ? (
        <p className={styles.error} role="alert">
          No se ha podido cargar la papelera.{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setReload((n) => n + 1)}
          >
            Reintentar
          </button>
        </p>
      ) : !data ? (
        <p className={styles.muted}>Cargando…</p>
      ) : data.items.length === 0 ? (
        <div className={styles.empty}>
          <p>
            {filtered
              ? "No hay nada eliminado que coincida."
              : "La papelera está vacía."}
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {data.items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className={styles.item}>
              <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
              <div className={styles.text}>
                <p>
                  <strong>{item.title}</strong>
                  {item.detail && (
                    <span className={styles.muted}> · {item.detail}</span>
                  )}
                </p>
                <p className={styles.muted}>{deletedLine(item)}</p>
              </div>
              <Button
                size="sm"
                loading={busy === item.id}
                loadingText="Restaurando…"
                aria-label={`Restaurar ${item.title}`}
                onClick={() => void restore(item)}
              >
                Restaurar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <div className={styles.pager}>
          <Button
            size="sm"
            disabledReason={page <= 1 ? "Es la primera página." : undefined}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className={styles.muted}>
            Página {page} de {pages}
          </span>
          <Button
            size="sm"
            disabledReason={page >= pages ? "Es la última página." : undefined}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}

      <p className={styles.muted}>
        Nada se borra del todo: al restaurar, una orden vuelve con su número, su
        historial y sus cobros.
      </p>
    </section>
  );
}
