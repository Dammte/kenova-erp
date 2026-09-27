"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/sidebar/page";
import styles from "@/app/admin-layout.module.css";
import { AuthProvider, useAuth } from "./AuthProvider";

/** Pages that render without the sidebar and without a session. */
const PUBLIC_PATHS = ["/login"];

function ProtectedContent({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  // Nothing from the app is rendered until the session is confirmed.
  if (loading || !user) return null;
  return (
    <div className={styles.adminContainer}>
      <Sidebar />
      <div className={styles.mainContent}>
        <main className={styles.pageContent}>{children}</main>
      </div>
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
