"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function ForgotPasswordPage() {
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
        setError("Introduce un email válido.");
        return;
      }
      setSent(true);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="text-sm text-gray-500">Te enviaremos un enlace para elegir una nueva.</p>
        </div>

        {sent ? (
          <p role="status" className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-3">
            Si <strong>{email}</strong> corresponde a una cuenta activa, recibirás un email con un
            enlace en unos minutos. Caduca en 30 minutos. Revisa también la carpeta de spam.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Email de tu cuenta</span>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              Enviar enlace
            </button>
          </form>
        )}

        <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-blue-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Volver a iniciar sesión
        </Link>
      </div>
    </div>
  );
}
