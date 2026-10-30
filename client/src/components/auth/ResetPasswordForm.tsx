"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { API_URL, errorMessage } from "@/lib/api";
import { AuthLayout, authStyles as styles } from "./AuthLayout";
import { NewPasswordFields, newPasswordProblem } from "./NewPasswordFields";

/** Design 3.7: the screen the reset email links to. */
export function ResetPasswordForm() {
  // null while reading the link; "" when it carries no token.
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The token travels in the URL fragment, which is never sent to servers.
    // Read it once and drop it from the address bar and history.
    const match = /token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    setToken(match ? match[1] : "");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordProblem(password, repeat)) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (res.status === 429) {
        setError("Demasiados intentos. Espera unos minutos y vuelve a probar.");
        return;
      }
      if (!res.ok) {
        setError(await errorMessage(res, "No se pudo cambiar la contraseña."));
        return;
      }
      setDone(true);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa la conexión a internet.");
    } finally {
      setSaving(false);
      setPassword("");
      setRepeat("");
    }
  };

  if (token === "") {
    return (
      <AuthLayout title="Enlace no válido">
        <p role="alert" className={styles.alert}>
          Este enlace no sirve o ya se usó. Pide uno nuevo: los enlaces caducan en 30 minutos.
        </p>
        <Link href="/recuperar-contrasena" className={styles.link}>
          Pedir otro enlace
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Contraseña cambiada">
        <p role="status" className={styles.success}>
          Ya puedes entrar con la contraseña nueva. Por seguridad hemos cerrado tu sesión en todos
          los equipos.
        </p>
        <Link href="/login" className={styles.link}>
          Iniciar sesión
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Elige una contraseña nueva">
      {token && (
        <form onSubmit={submit} className={styles.form} noValidate>
          {error && (
            <p role="alert" className={styles.alert}>
              {error}
            </p>
          )}
          <NewPasswordFields
            password={password}
            repeat={repeat}
            onPassword={setPassword}
            onRepeat={setRepeat}
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className={styles.submit}
            loading={saving}
            loadingText="Guardando…"
            disabledReason={saving ? undefined : newPasswordProblem(password, repeat)}
          >
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
