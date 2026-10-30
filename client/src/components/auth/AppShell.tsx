"use client";

import { usePathname } from "next/navigation";
import BottomBar from "@/components/shell/BottomBar";
import Sidebar from "@/components/shell/Sidebar";
import Topbar from "@/components/shell/Topbar";
import styles from "@/app/admin-layout.module.css";
import { AuthProvider, useAuth } from "./AuthProvider";

/** Pages that render without the sidebar and without a session. */
const PUBLIC_PATHS = ["/login", "/recuperar-contrasena", "/restablecer-contrasena"];

function ProtectedContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  // Nothing from the app is rendered until the session is confirmed.
  if (loading || !user) return null;
  // First access: only the "choose a new password" screen, without the app
  // around it; any other page waits for the redirect to it.
  if (user.mustChangePassword) {
    return pathname === "/cuenta/contrasena" ? <>{children}</> : null;
  }
  return (
    <div className={styles.adminContainer}>
      <Sidebar />
      <div className={styles.mainContent}>
        <Topbar />
        <main className={styles.pageContent}>{children}</main>
      </div>
      <BottomBar />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;
  return (
    <AuthProvider>
      <ProtectedContent>{children}</ProtectedContent>
    </AuthProvider>
  );
}
