"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default function ChangePasswordPage() {
  const { user } = useAuth();
  return <ChangePasswordForm firstAccess={Boolean(user?.mustChangePassword)} />;
}
