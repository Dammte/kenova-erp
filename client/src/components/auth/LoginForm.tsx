"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Button, TextField } from "@/components/ui";
import { API_URL } from "@/lib/api";
import styles from "./LoginForm.module.css";

/** Only same-site relative paths are accepted as a post-login destination. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) {
    return "/dashboard";
  }
  return next;
}

// Neutral on purpose: it never tells whether the email has an account.
const WRONG =
  "El email o la contraseña no son correctos. Revisa las mayúsculas o pide a un socio que te restablezca la contraseña.";

interface Props {
  /** Where to go after signing in, from the `next` query parameter. */
  next: string | null;
  navigate?: (url: string) => void;
}

/** Design 3.7: sign-in on a shared counter computer. */
export function LoginForm({ next, navigate = (url) => window.location.assign(url) }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [canReset, setCanReset] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/auth/password-reset/available`)
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((b) => setCanReset(b.available === true))
      .catch(() => setCanReset(false));
  }, []);

  const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState("CapsLock"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 429) {
        setError("Demasiados intentos. Espera un minuto y vuelve a probar.");
        return;
      }
      if (!res.ok) {
        setError(WRONG);
        return;
      }
      const { user } = await res.json();
      navigate(user.mustChangePassword ? "/cuenta/contrasena" : safeNext(next));
    } catch {
      setError("No se pudo conectar con el servidor. Revisa la conexión a internet.");
    } finally {
      setLoading(false);
      setPassword("");
    }
  };

  const missing = !email.trim()
    ? "Escribe tu email."
    : !password
      ? "Escribe tu contraseña."
      : undefined;

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <div className={styles.brand}>Kenova</div>
        <form onSubmit={submit} className={styles.card} noValidate>
          <h1 className={styles.title}>Iniciar sesión</h1>
          {error && (
            <p role="alert" className={styles.alert}>
              {error}
            </p>
          )}
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Contraseña"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={trackCapsLock}
            onKeyUp={trackCapsLock}
            hint={capsLock ? "Bloq Mayús está activado." : undefined}
            suffix={
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </Button>
            }
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className={styles.submit}
            loading={loading}
            loadingText="Entrando…"
            disabledReason={loading ? undefined : missing}
          >
            Entrar
          </Button>
          {canReset ? (
            <Link href="/recuperar-contrasena" className={styles.link}>
              ¿Olvidaste tu contraseña?
            </Link>
          ) : (
            <p className={styles.note}>
              ¿Has olvidado la contraseña? Pide a un socio que te la restablezca.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
