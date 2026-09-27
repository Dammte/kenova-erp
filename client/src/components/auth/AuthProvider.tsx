"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";

export type Role = "SUPER_ADMIN" | "STORE_ADMIN";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        if (data.user.mustChangePassword && window.location.pathname !== "/cuenta/contrasena") {
          window.location.href = "/cuenta/contrasena";
        }
      } else {
        setUser(null);
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiFetch(`${API_URL}/auth/logout`, { method: "POST" }).catch(() => undefined);
    setUser(null);
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
