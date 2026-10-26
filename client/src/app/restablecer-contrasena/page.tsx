"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { API_URL, errorMessage } from "@/lib/api";

const MIN_LENGTH = 12;

export default function ResetPasswordPage() {
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
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`La contraseña necesita al menos ${MIN_LENGTH} caracteres.`);
    if (password !== repeat) return setError("Las contraseñas no coinciden.");
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (res.status === 429) return setError("Demasiados intentos. Espera unos minutos.");
      if (!res.ok) return setError(await errorMessage(res, "No se pudo cambiar la contraseña."));
      setDone(true);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
      setPassword("");
      setRepeat("");
    }
  };

  const input =
    "w-full pl-10 pr-3 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-5">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Nueva contraseña</h1>

        {token === "" && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            El enlace no es válido. Pide uno nuevo desde{" "}
            <Link href="/recuperar-contrasena" className="underline">recuperar contraseña</Link>.
          </p>
        )}

        {done ? (
          <div className="space-y-4">
            <p role="status" className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-3">
              Contraseña cambiada. Por seguridad se han cerrado todas tus sesiones.
            </p>
            <Link href="/login" className="block text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl">
              Iniciar sesión
            </Link>
          </div>
        ) : (
          token && (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Nueva contraseña (mínimo {MIN_LENGTH} caracteres)</span>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
                </div>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Repite la contraseña</span>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={input} />
                </div>
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={saving || !password || !repeat}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
              >
                {saving && <Loader2 className="w-5 h-5 animate-spin" />}
                Guardar contraseña
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
}
