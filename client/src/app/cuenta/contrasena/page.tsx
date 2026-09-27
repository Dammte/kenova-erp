"use client";

import { useState } from "react";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";

const MIN_LENGTH = 12;

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) return setError(`La nueva contraseña necesita al menos ${MIN_LENGTH} caracteres.`);
    if (next !== repeat) return setError("Las contraseñas nuevas no coinciden.");
    setSaving(true);
    try {
      const res = await apiFetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        setError(await errorMessage(res, "No se pudo cambiar la contraseña."));
        return;
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setRepeat("");
      if (user?.mustChangePassword) window.location.href = "/dashboard";
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Cambiar contraseña</h1>
      {user?.mustChangePassword && (
        <p className="mb-4 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Tu contraseña es temporal. Elige una nueva para continuar.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4 bg-white rounded-xl shadow p-6">
        <label className="block text-sm font-medium text-gray-700">
          Contraseña actual
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Nueva contraseña (mínimo {MIN_LENGTH} caracteres)
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Repite la nueva contraseña
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={input} />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-green-700">Contraseña cambiada. Se ha cerrado la sesión en tus otros dispositivos.</p>}
        <button
          type="submit"
          disabled={saving || !current || !next || !repeat}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg"
        >
          Guardar
        </button>
      </form>
    </div>
  );
}
