"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";

export type Role = "SUPER_ADMIN" | "STORE_ADMIN";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** The store of a STORE_ADMIN; null for the partners. */
  storeId: string | null;
  mustChangePassword: boolean;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  /**
   * The server did not answer (asleep, down or no connection). The session is
   * unknown, so the user is neither let in nor sent to the login: it retries.
   */
  unreachable: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** «Cerrar sesión en todos los equipos»: this one included. */
  logoutEverywhere: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  unreachable: false,
  refresh: async () => {},
  logout: async () => {},
  logoutEverywhere: async () => {},
});

/** Seconds between automatic retries while the server does not answer. */
export const RETRY_SECONDS = 5;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Failed checks in a row; each one schedules the next retry.
  const [failures, setFailures] = useState(0);
  const unreachable = failures > 0;

  const refresh = useCallback(async () => {
    try {
      let res: Response;
      try {
        res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
      } catch {
        // No answer at all: no connection, or the server is down.
        setFailures((n) => n + 1);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setFailures(0);
        setUser(data.user);
        if (data.user.mustChangePassword && window.location.pathname !== "/cuenta/contrasena") {
          window.location.href = "/cuenta/contrasena";
        }
      } else if (res.status === 401 || res.status === 403) {
        setUser(null);
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
      } else {
        // 5xx: the server is waking up or failing; the session may be fine.
        setFailures((n) => n + 1);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // While the server does not answer, keep trying on our own.
  useEffect(() => {
    if (failures === 0) return;
    const timer = setTimeout(() => void refresh(), RETRY_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [failures, refresh]);

  const logout = useCallback(async () => {
    await apiFetch(`${API_URL}/auth/logout`, { method: "POST" }).catch(() => undefined);
    setUser(null);
    window.location.href = "/login";
  }, []);

  const logoutEverywhere = useCallback(async () => {
    const res = await apiFetch(`${API_URL}/auth/logout-all`, { method: "POST" });
    // Stay in on failure: the caller says the other devices are still open.
    if (!res.ok) throw new Error(`logout-all ${res.status}`);
    setUser(null);
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, unreachable, refresh, logout, logoutEverywhere }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
