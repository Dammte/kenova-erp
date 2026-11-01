"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { StoreForm, type StoreUser } from "./StoreForm";
import { commissionLabel, orderCount, type StoreData } from "./stores";
import styles from "./Stores.module.css";

/** Design R2 3.7: partners only, like the menu entry. */
export function StoresPage() {
  const { user } = useAuth();
  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p>
            <strong>Sin permiso.</strong> La configuración de tiendas la gestionan los socios.
          </p>
          <Link href="/panel" className={styles.link}>
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }
  return <Stores />;
}

function Stores() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [stores, setStores] = useState<StoreData[] | null>(null);
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Each load restarts the form from what the server holds now.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    Promise.all([apiFetch(`${API_URL}/stores`), apiFetch(`${API_URL}/users`)])
      .then(async ([s, u]) => {
        if (!s.ok) throw new Error(String(s.status));
        const list = (await s.json()) as StoreData[];
        const people = u.ok ? ((await u.json()) as StoreUser[]) : [];
        if (live) {
          setStores(list);
          setUsers(people);
          setVersion((v) => v + 1);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  // The open store lives in the address; the workshop opens by default.
  const asked = params.get("tienda");
  const open = asked ?? stores?.[0]?.id ?? null;
  const select = (id: string | null) =>
    router.replace(id ? `${pathname}?tienda=${id}` : pathname, { scroll: false });

  const accountsOf = (storeId: string) =>
    users.filter((u) => u.role === "STORE_ADMIN" && u.storeId === storeId && u.isActive);

  if (failed) {
    return (
      <div className={styles.page}>
        <p className={styles.error} role="alert">
          No se han podido cargar las tiendas.{" "}
          <button type="button" className={styles.linkButton} onClick={() => setAttempt((a) => a + 1)}>
            Reintentar
          </button>
        </p>
      </div>
    );
  }

  const current = stores?.find((s) => s.id === open);
  const onlyMain = stores !== null && stores.every((s) => s.isMain);

  return (
    <div className={styles.page}>
      <section className={styles.listPane} aria-label="Tiendas">
        <div className={styles.top}>
          <h1 className={styles.title}>Tiendas</h1>
          <Button size="sm" onClick={() => select("nueva")}>
            + Nueva tienda
          </Button>
        </div>
        {stores === null ? (
          <p className={styles.muted}>Cargando tiendas…</p>
        ) : (
          <ul className={styles.list}>
            {stores.map((s) => {
              const accounts = accountsOf(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-current={s.id === open ? "true" : undefined}
                    onClick={() => select(s.id)}
                  >
                    <span className={styles.itemHead}>
                      <span className={styles.itemName}>{s.name}</span>
                      <span className={styles.prefix}>{s.prefix}</span>
                    </span>
                    <span className={styles.sub}>
                      {s.isMain ? "Taller de Kenova" : "Tienda aliada · punto de recepción"}
                      {!s.isActive && " · desactivada"}
                    </span>
                    <span className={styles.sub}>
                      {orderCount(s)} órdenes
                      {!s.isMain && ` · ${commissionLabel(s.commissionType, s.commissionValue)}`}
                      {!s.isMain &&
                        (accounts.length ? (
                          ` · ${accounts.map((a) => a.fullName).join(", ")}`
                        ) : (
                          <span className={styles.warn}> · sin usuario</span>
                        ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {onlyMain && (
          <p className={styles.muted}>
            Añade la primera tienda aliada para que pueda dar de alta equipos con su prefijo.
          </p>
        )}
      </section>

      {stores !== null && (open === "nueva" || current) && (
        <StoreForm
          key={`${open}-${version}`}
          store={open === "nueva" ? undefined : current}
          accounts={current ? accountsOf(current.id) : []}
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
