"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useAuth } from "./AuthProvider";
import { AuthCard, authStyles as styles } from "./AuthLayout";

/** Design 3.7 (D9) in «Mi cuenta»: how long a session lasts, and how to close them all. */
export function SessionsCard() {
  const { logoutEverywhere } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const closeAll = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await logoutEverywhere();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Sesiones abiertas"
      lead="Tu sesión sigue abierta mientras uses Kenova en las últimas 24 horas, hasta un máximo de 30 días. Si te la dejaste abierta en otro equipo, ciérrala aquí; también se cerrará en este."
      className={styles.inline}
    >
      <div className={styles.form}>
        {failed && (
          <p role="alert" className={styles.alert}>
            No se pudieron cerrar las sesiones. Revisa la conexión y vuelve a probar.
          </p>
        )}
        <Button variant="secondary" loading={busy} loadingText="Cerrando…" onClick={closeAll}>
          Cerrar sesión en todos los equipos
        </Button>
      </div>
    </AuthCard>
  );
}
