"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, TextField, type TextFieldProps } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import {
  emptySupplier,
  supplierBody,
  supplierDraftFrom,
  supplierSummary,
  validateSupplier,
  type SupplierData,
  type SupplierDraft,
  type SupplierErrors,
} from "./suppliers";
// Same list-and-card layout as «Tienda».
import styles from "../stores/Stores.module.css";

/** Administrator only, like the stock and the menu entry. */
export function SuppliersPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>
            <strong>Sin permiso.</strong> Los proveedores los gestiona el administrador.
          </p>
          <Link href="/panel" className={styles.link}>
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }
  return <Suppliers />;
}

function Suppliers() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [suppliers, setSuppliers] = useState<SupplierData[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Each load restarts the form from what the server holds now.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(`${API_URL}/suppliers`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const list = (await res.json()) as SupplierData[];
        if (live) {
          setSuppliers(list);
          setVersion((v) => v + 1);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  // The open supplier lives in the address; nothing opens by default.
  const open = params.get("proveedor");
  const select = (id: string | null) =>
    router.replace(id ? `${pathname}?proveedor=${id}` : pathname, { scroll: false });

  if (failed) {
    return (
      <div className={styles.page}>
        <p className={styles.error} role="alert">
          No se han podido cargar los proveedores.{" "}
          <button type="button" className={styles.linkButton} onClick={() => setAttempt((a) => a + 1)}>
            Reintentar
          </button>
        </p>
      </div>
    );
  }

  const current = suppliers?.find((s) => s.id === open);

  return (
    <div className={styles.page}>
      <section className={styles.listPane} aria-label="Proveedores">
        <div className={styles.top}>
          <h1 className={styles.title}>Proveedores</h1>
          <Button size="sm" onClick={() => select("nuevo")}>
            + Nuevo proveedor
          </Button>
        </div>
        {suppliers === null ? (
          <p className={styles.muted}>Cargando proveedores…</p>
        ) : suppliers.length === 0 ? (
          <p className={styles.muted}>
            Todavía no hay proveedores. Añade a quien le compras los repuestos para tener a mano sus datos.
          </p>
        ) : (
          <ul className={styles.list}>
            {suppliers.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.item}
                  aria-current={s.id === open ? "true" : undefined}
                  onClick={() => select(s.id)}
                >
                  <span className={styles.itemHead}>
                    <span className={styles.itemName}>{s.name}</span>
                    {!s.active && <span className={styles.off}>Desactivado</span>}
                  </span>
                  <span className={styles.sub}>{supplierSummary(s) || "Sin datos de contacto"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {suppliers !== null && (open === "nuevo" || current) && (
        <SupplierForm
          key={`${open}-${version}`}
          supplier={open === "nuevo" ? undefined : current}
          onSaved={(id) => {
            setAttempt((a) => a + 1);
            select(id);
          }}
          onCancel={() => select(null)}
        />
      )}
    </div>
  );
}

interface FormProps {
  /** The supplier to edit; without it the form creates one. */
  supplier?: SupplierData;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

/** One supplier, all its data, one «Guardar». */
export function SupplierForm({ supplier, onSaved, onCancel }: FormProps) {
  const original = supplier ? supplierDraftFrom(supplier) : undefined;
  const [d, setD] = useState<SupplierDraft>(original ?? emptySupplier());
  const [errors, setErrors] = useState<SupplierErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const set = (key: keyof SupplierDraft, value: string) => {
    setD((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const body = supplierBody(d, original);
  const dirty = !supplier || Object.keys(body).length > 0;

  const send = async (payload: Record<string, unknown>) => {
    setProblem(null);
    setSaving(true);
    try {
      const res = await apiFetch(supplier ? `${API_URL}/suppliers/${supplier.id}` : `${API_URL}/suppliers`, {
        method: supplier ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se han podido guardar los cambios."));
        return;
      }
      onSaved(((await res.json()) as { id: string }).id);
    } catch {
      setProblem("No se han podido guardar los cambios. Comprueba la conexión; los datos siguen aquí.");
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateSupplier(d);
    setErrors(found);
    if (Object.keys(found).length) return;
    void send(body);
  };

  const field = (key: keyof SupplierDraft, label: string, extra: Partial<TextFieldProps> = {}) => (
    <TextField label={label} value={d[key]} error={errors[key]} onChange={(e) => set(key, e.target.value)} {...extra} />
  );

  return (
    <aside className={styles.card} aria-label={supplier ? `Proveedor ${supplier.name}` : "Nuevo proveedor"}>
      <form onSubmit={submit} noValidate>
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{supplier ? supplier.name : "Nuevo proveedor"}</h2>
          {supplier && (
            <span className={supplier.active ? styles.ok : styles.off}>{supplier.active ? "Activo" : "Desactivado"}</span>
          )}
          <button type="button" className={styles.close} onClick={onCancel} aria-label="Cerrar">
            <X size={18} aria-hidden />
          </button>
        </header>

        <fieldset className={styles.section}>
          <legend>Empresa</legend>
          {field("name", "Nombre", { required: true, maxLength: 80 })}
          <div className={styles.pair}>
            {field("taxId", "CIF", { maxLength: 15 })}
            {field("customerNumber", "Nº de cliente", { maxLength: 40, hint: "El que te dio el proveedor." })}
          </div>
          {field("website", "Web", { type: "url", inputMode: "url", placeholder: "https://", maxLength: 200 })}
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Contacto</legend>
          {field("contactName", "Persona de contacto", { maxLength: 80 })}
          <div className={styles.pair}>
            {field("phone", "Teléfono", { inputMode: "tel", maxLength: 20 })}
            {field("email", "Email", { type: "email", inputMode: "email", maxLength: 150 })}
          </div>
          {field("notes", "Notas", {
            maxLength: 1000,
            hint: "Plazos de entrega, pedido mínimo, gastos de envío…",
          })}
        </fieldset>

        {supplier && (
          <fieldset className={styles.section}>
            <legend>{supplier.active ? "Desactivar proveedor" : "Proveedor desactivado"}</legend>
            {supplier.active ? (
              <>
                <p className={styles.muted}>Deja de proponerse para compras nuevas. Las compras anteriores lo conservan.</p>
                {confirmOff ? (
                  <div className={styles.confirm}>
                    <span>¿Desactivar {supplier.name}?</span>
                    <Button variant="danger" size="sm" loading={saving} onClick={() => void send({ active: false })}>
                      Sí, desactivar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmOff(false)}>
                      No
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setConfirmOff(true)}>
                    Desactivar…
                  </Button>
                )}
              </>
            ) : (
              <Button variant="secondary" size="sm" loading={saving} onClick={() => void send({ active: true })}>
                Reactivar
              </Button>
            )}
          </fieldset>
        )}

        {problem && (
          <p role="alert" className={styles.error}>
            {problem}
          </p>
        )}
        {dirty && (
          <div className={styles.saveBar}>
            <Button type="submit" variant="primary" loading={saving} loadingText="Guardando…">
              {supplier ? "Guardar cambios" : "Crear proveedor"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!original) return onCancel();
                setD(original);
                setErrors({});
              }}
            >
              {supplier ? "Descartar" : "Cancelar"}
            </Button>
          </div>
        )}
      </form>
    </aside>
  );
}
