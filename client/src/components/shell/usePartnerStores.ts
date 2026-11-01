"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/components/auth/AuthProvider";
import { API_URL, apiFetch } from "@/lib/api";

// One question per page load: the stores rarely change.
let asked: Promise<boolean> | null = null;

/** For the tests: forget the answer. */
export function resetPartnerStores() {
  asked = null;
}

/**
 * Whether «Envíos» belongs in the menu (approved menu, 2026-10-30): for the
 * partners, only once there is an active partner store; a store account
 * always sends or receives them.
 */
export function usePartnerStores(role: Role | undefined): boolean {
  const [partners, setPartners] = useState(false);
  useEffect(() => {
    if (role !== "SUPER_ADMIN") return;
    asked ??= apiFetch(`${API_URL}/stores`)
      .then(async (res) => {
        if (!res.ok) return false;
        const stores = (await res.json()) as { isMain: boolean; isActive: boolean }[];
        return stores.some((s) => !s.isMain && s.isActive);
      })
      .catch(() => false);
    let live = true;
    void asked.then((v) => live && setPartners(v));
    return () => {
      live = false;
    };
  }, [role]);
  return role === "STORE_ADMIN" || partners;
}
