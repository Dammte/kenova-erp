"use client";

import { useCallback, useEffect, useState } from "react";
import { showToast } from "nextjs-toast-notify";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { Role, useAuth } from "@/components/auth/AuthProvider";

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super administrador",
  STORE_ADMIN: "Administrador de tienda",
};

/** 18 random bytes, base64url: shown once to the admin to hand over. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const toastOpts = { duration: 4000, position: "top-right" as const };

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ username: "", fullName: "", email: "", role: "STORE_ADMIN" as Role });
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`${API_URL}/users`);
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => {
    if (me?.role === "SUPER_ADMIN") load();
  }, [me, load]);

  if (me && me.role !== "SUPER_ADMIN") {
    return <p className="p-6">No tienes permiso para ver esta página.</p>;
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const temporaryPassword = randomPassword();
    const res = await apiFetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, temporaryPassword }),
    });
    if (!res.ok) return showToast.error(await errorMessage(res, "No se pudo crear el usuario"), toastOpts);
    setIssued({ email: form.email.trim().toLowerCase(), password: temporaryPassword });
    setForm({ username: "", fullName: "", email: "", role: "STORE_ADMIN" });
    load();
  };

  const resetPassword = async (u: UserRow) => {
    if (!confirm(`¿Generar una contraseña temporal nueva para ${u.email}? Se cerrarán sus sesiones.`)) return;
    const temporaryPassword = randomPassword();
    const res = await apiFetch(`${API_URL}/users/${u.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temporaryPassword }),
    });
    if (!res.ok) return showToast.error(await errorMessage(res, "No se pudo restablecer"), toastOpts);
    setIssued({ email: u.email, password: temporaryPassword });
    load();
  };

  const setActive = async (u: UserRow, isActive: boolean) => {
    const res = await apiFetch(`${API_URL}/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) return showToast.error(await errorMessage(res, "No se pudo actualizar"), toastOpts);
    load();
  };

  const input = "px-3 py-2 border rounded-lg w-full";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Usuarios</h1>

      {issued && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <p className="font-semibold">Contraseña temporal para {issued.email}</p>
          <p className="font-mono text-base my-2 select-all">{issued.password}</p>
          <p>Entrégala por un canal privado. Solo se muestra ahora; al entrar se le pedirá cambiarla.</p>
          <button className="mt-2 underline" onClick={() => setIssued(null)}>Ocultar</button>
        </div>
      )}

      <form onSubmit={create} className="bg-white rounded-xl shadow p-4 grid gap-3 md:grid-cols-5 items-end">
        <input className={input} placeholder="Usuario" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input className={input} placeholder="Nombre completo" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <input className={input} placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          <option value="STORE_ADMIN">{ROLE_LABEL.STORE_ADMIN}</option>
          <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>
        </select>
        <button className="bg-blue-600 text-white rounded-lg py-2 font-semibold">Crear</button>
      </form>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3">Nombre</th>
              <th className="p-3">Email</th>
              <th className="p-3">Rol</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Último acceso</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3">{u.fullName}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{ROLE_LABEL[u.role]}</td>
                <td className="p-3">{u.isActive ? (u.mustChangePassword ? "Pendiente de contraseña" : "Activo") : "Desactivado"}</td>
                <td className="p-3">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("es-ES") : "—"}</td>
                <td className="p-3 whitespace-nowrap space-x-3">
                  <button className="underline" onClick={() => resetPassword(u)}>Restablecer contraseña</button>
                  {u.id !== me?.id &&
                    (u.isActive ? (
                      <button className="underline text-red-600" onClick={() => setActive(u, false)}>Desactivar</button>
                    ) : (
                      <button className="underline" onClick={() => setActive(u, true)}>Activar</button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
