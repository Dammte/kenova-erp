"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, TextField } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { AuthLayout, authStyles as styles } from "./AuthLayout";

/** Design 3.7 «Recuperar acceso». The answer never tells whether the email exists. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setError("Demasiadas solicitudes. Espera unos minutos y vuelve a probar.");
        return;
      }
      if (!res.ok) {
        setError("Ese email no parece válido. Revisa que esté bien escrito.");
        return;
      }
      setSent(true);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa la conexión a internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Recuperar acceso"
      lead="Escribe tu email y te enviaremos un enlace para elegir una contraseña nueva."
    >
      {sent ? (
        <p role="status" className={styles.success}>
          Si ese email tiene cuenta en Kenova, recibirás un enlace en unos minutos. Caduca en 30
          minutos. Mira también en correo no deseado.
        </p>
      ) : (
        <form onSubmit={submit} className={styles.form} noValidate>
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
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className={styles.submit}
            loading={loading}
            loadingText="Enviando…"
            disabledReason={loading || email.trim() ? undefined : "Escribe tu email."}
          >
            Enviar enlace
          </Button>
        </form>
      )}
      <Link href="/login" className={styles.link}>
        Volver a iniciar sesión
      </Link>
    </AuthLayout>
  );
}
