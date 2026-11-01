"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { SessionsCard } from "@/components/auth/SessionsCard";

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const firstAccess = Boolean(user?.mustChangePassword);
  return (
    <>
      <ChangePasswordForm firstAccess={firstAccess} />
      {user && !firstAccess && <SessionsCard />}
    </>
  );
}
