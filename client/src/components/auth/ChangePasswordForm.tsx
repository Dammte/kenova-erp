"use client";

import { useState } from "react";
import { Button, TextField } from "@/components/ui";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { AuthCard, AuthLayout, authStyles as styles } from "./AuthLayout";
import { NewPasswordFields, newPasswordProblem } from "./NewPasswordFields";

interface Props {
  /** First access with a temporary password: full screen, then into the app. */
  firstAccess: boolean;
  navigate?: (url: string) => void;
}

/**
 * Design 3.7: first access is the reset screen with another title; from the
 * user menu the same form sits inside the app.
 */
export function ChangePasswordForm({
  firstAccess,
  navigate = (url) => window.location.assign(url),
}: Props) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const problem = !current
    ? firstAccess
      ? "Escribe la contraseña temporal."
      : "Escribe tu contraseña actual."
    : newPasswordProblem(password, repeat);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    setError(null);
    setDone(false);
    setSaving(true);
    try {
      const res = await apiFetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      });
      if (!res.ok) {
        setError(await errorMessage(res, "No se pudo cambiar la contraseña."));
        return;
      }
      if (firstAccess) {
        navigate("/panel");
        return;
      }
      setDone(true);
      setCurrent("");
      setPassword("");
      setRepeat("");
    } catch {
      setError("No se pudo conectar con el servidor. Revisa la conexión a internet.");
    } finally {
      setSaving(false);
    }
  };

  const form = (
    <form onSubmit={submit} className={styles.form} noValidate>
      {error && (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      )}
      {done && (
        <p role="status" className={styles.success}>
          Contraseña cambiada. Hemos cerrado tu sesión en los demás equipos.
        </p>
      )}
      <TextField
        label={firstAccess ? "Contraseña temporal" : "Contraseña actual"}
        type="password"
        autoComplete="current-password"
        autoFocus={firstAccess}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
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
        disabledReason={saving ? undefined : problem}
      >
        {firstAccess ? "Guardar y entrar" : "Guardar"}
      </Button>
    </form>
  );

  return firstAccess ? (
    <AuthLayout
      title="Elige una contraseña nueva"
      lead="Tu cuenta tiene una contraseña temporal. Cámbiala para continuar."
    >
      {form}
    </AuthLayout>
  ) : (
    <AuthCard title="Cambiar contraseña" className={styles.inline}>
      {form}
    </AuthCard>
  );
}
