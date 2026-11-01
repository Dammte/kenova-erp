"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import {
  DEVICE_TYPES,
  duplicateGroups,
  filterModels,
  mergeSummary,
  namesList,
  suggestedKeep,
  type CatalogModel,
  type DeviceType,
} from "./catalog";
import styles from "./Catalog.module.css";

/** Design R2 3.8: partners only, like the menu entry. */
export function CatalogPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>
            <strong>Sin permiso.</strong> El catálogo de marcas y modelos lo
            gestionan los socios.
          </p>
          <Link href="/panel" className={styles.link}>
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }
  return <Catalog />;
}

const URL = `${API_URL}/catalog/models`;

function Catalog() {
  const [rows, setRows] = useState<CatalogModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [merging, setMerging] = useState<CatalogModel[] | null>(null);

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as CatalogModel[];
        if (live) setRows(body);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [reload]);

  /** Sends a change; answers whether it went through. */
  const change = async (
    url: string,
    init: RequestInit,
    fallback: string,
  ): Promise<boolean> => {
    setProblem(null);
    try {
      const res = await apiFetch(url, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, fallback));
        return false;
      }
      return true;
    } catch {
      setProblem(`${fallback} Revisa la conexión y vuelve a intentarlo.`);
      return false;
    } finally {
      setReload((n) => n + 1);
    }
  };

  const patch = (row: CatalogModel, body: object, fallback: string) =>
    change(
      `${URL}/${row.id}`,
      { method: "PATCH", body: JSON.stringify(body) },
      fallback,
    );

  if (failed && !rows) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Marcas y modelos</h1>
        <p className={styles.error} role="alert">
          No se ha podido cargar el catálogo.{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setReload((n) => n + 1)}
          >
            Reintentar
          </button>
        </p>
      </div>
    );
  }

  const groups = rows ? duplicateGroups(rows) : [];
  const shown = rows ? filterModels(rows, query) : [];

  return (
    <section className={styles.page} aria-label="Marcas y modelos">
      <div className={styles.top}>
        <h1 className={styles.title}>Marcas y modelos</h1>
        <input
          type="search"
          className={styles.search}
          placeholder="Buscar marca o modelo…"
          aria-label="Buscar marca o modelo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {merging ? (
        <MergePanel
          group={merging}
          onCancel={() => setMerging(null)}
          onMerge={async (keep) => {
            for (const from of merging.filter((r) => r.id !== keep.id)) {
              const ok = await change(
                `${URL}/${keep.id}/merge`,
                { method: "POST", body: JSON.stringify({ fromId: from.id }) },
                `No se ha podido unir ${from.name}.`,
              );
              if (!ok) return;
            }
            setMerging(null);
          }}
        />
      ) : (
        groups.map((g) => (
          <div key={g[0].id} className={styles.warn} role="status">
            <p>
              Posibles duplicados: {namesList(g)}
              {g[0].brand && ` (${g[0].brand.name})`}.
            </p>
            <Button size="sm" onClick={() => setMerging(g)}>
              Revisar y unir
            </Button>
          </div>
        ))
      )}

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}

      {!rows ? (
        <p className={styles.muted}>Cargando modelos…</p>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          <p>Aún no hay modelos. Se crean al añadir tarifas de un modelo.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className={styles.muted}>Ningún modelo coincide con «{query}».</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Marca</th>
                <th scope="col">Modelo</th>
                <th scope="col">Tipo</th>
                <th scope="col" className={styles.num}>
                  Equipos
                </th>
                <th scope="col" className={styles.num}>
                  Tarifas
                </th>
                <th scope="col">
                  <span className={styles.hidden}>Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} data-inactive={row.active ? undefined : ""}>
                  <td>{row.brand?.name ?? "—"}</td>
                  <td>
                    {renaming === row.id ? (
                      <RenameForm
                        row={row}
                        onCancel={() => setRenaming(null)}
                        onSave={async (name) => {
                          if (
                            await patch(
                              row,
                              { name },
                              "No se ha podido renombrar el modelo.",
                            )
                          )
                            setRenaming(null);
                        }}
                      />
                    ) : (
                      <>
                        <span className={styles.name}>{row.name}</span>
                        {row.duplicates.length > 0 && (
                          <span className={styles.badgeWarn}>¿Duplicado?</span>
                        )}
                        {!row.active && (
                          <span className={styles.badge}>Desactivado</span>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      aria-label={`Tipo de ${row.name}`}
                      value={row.deviceType ?? ""}
                      onChange={(e) =>
                        void patch(
                          row,
                          { deviceType: e.target.value as DeviceType },
                          "No se ha podido cambiar el tipo.",
                        )
                      }
                    >
                      {!row.deviceType && <option value="">Sin tipo</option>}
                      {DEVICE_TYPES.map(([t, label]) => (
                        <option key={t} value={t}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={styles.num}>{row.devices}</td>
                  <td className={styles.num}>{row.rates}</td>
                  <td className={styles.actions}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      aria-label={`Renombrar ${row.name}`}
                      onClick={() => setRenaming(row.id)}
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      aria-label={`${row.active ? "Desactivar" : "Reactivar"} ${row.name}`}
                      onClick={() =>
                        void patch(
                          row,
                          { active: !row.active },
                          "No se ha podido cambiar el modelo.",
                        )
                      }
                    >
                      {row.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.muted}>
        El tipo de cada modelo es el que se propone al dar de alta un equipo. Un
        modelo desactivado no se ofrece en el alta ni en las tarifas, pero sus
        equipos y tarifas se conservan.
      </p>
    </section>
  );
}

function RenameForm({
  row,
  onSave,
  onCancel,
}: {
  row: CatalogModel;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    await onSave(name.trim());
    setSaving(false);
  };
  return (
    <form
      className={styles.rename}
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      aria-label={`Renombrar ${row.name}`}
    >
      <TextField
        label="Nuevo nombre"
        value={name}
        maxLength={50}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className={styles.formActions}>
        <Button
          type="submit"
          size="sm"
          variant="primary"
          loading={saving}
          disabledReason={name.trim() ? undefined : "Escribe el nombre."}
        >
          Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function MergePanel({
  group,
  onMerge,
  onCancel,
}: {
  group: CatalogModel[];
  onMerge: (keep: CatalogModel) => Promise<void>;
  onCancel: () => void;
}) {
  const [keepId, setKeepId] = useState(() => suggestedKeep(group).id);
  const [saving, setSaving] = useState(false);
  const keep = group.find((r) => r.id === keepId) ?? group[0];
  return (
    <section className={styles.merge} aria-label="Unir duplicados">
      <h2 className={styles.subtitle}>
        Unir {namesList(group)}
        {group[0].brand && ` (${group[0].brand.name})`}
      </h2>
      <fieldset className={styles.choices}>
        <legend>¿Cuál se conserva?</legend>
        {group.map((r) => (
          <label key={r.id} className={styles.choice}>
            <input
              type="radio"
              name="keep"
              checked={r.id === keepId}
              onChange={() => setKeepId(r.id)}
            />
            <span>
              <strong>{r.name}</strong> · {r.devices}{" "}
              {r.devices === 1 ? "equipo" : "equipos"} · {r.rates}{" "}
              {r.rates === 1 ? "tarifa" : "tarifas"}
            </span>
          </label>
        ))}
      </fieldset>
      <p>{mergeSummary(keep, group)}</p>
      <div className={styles.formActions}>
        <Button
          variant="primary"
          loading={saving}
          loadingText="Uniendo…"
          onClick={async () => {
            setSaving(true);
            await onMerge(keep);
            setSaving(false);
          }}
        >
          Unir en «{keep.name}»
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}
