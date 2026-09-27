"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Fingerprint, KeyRound } from "lucide-react";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";

export type UnlockSecretType = "CODE" | "PATTERN";

const VISIBLE_MS = 30_000;

/**
 * Shows whether a device has an unlock PIN/pattern stored and lets a signed-in
 * user reveal it on demand. Each reveal is recorded on the server (who and when),
 * and the value hides itself again after 30 seconds.
 */
export default function UnlockSecretReveal({
  deviceId,
  type,
  className,
}: {
  deviceId: string;
  type?: UnlockSecretType | null;
  className?: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setValue(null), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [value]);

  if (!type) return null;

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/devices/${deviceId}/unlock-secret/reveal`, { method: "POST" });
      if (!res.ok) {
        setError(await errorMessage(res, "No se pudo mostrar"));
        return;
      }
      const data: { type: UnlockSecretType; value: string } = await res.json();
      setValue(data.type === "PATTERN" ? data.value.split("-").join(" › ") : data.value);
    } finally {
      setLoading(false);
    }
  };

  const Icon = type === "PATTERN" ? Fingerprint : KeyRound;
  const label = type === "PATTERN" ? "Patrón" : "Código";

  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <Icon size={13} />
      <span>
        {label}:{" "}
        {value ? <strong style={{ fontFamily: "monospace" }}>{value}</strong> : <span>•••• (cifrado)</span>}
      </span>
      <button
        type="button"
        onClick={value ? () => setValue(null) : reveal}
        disabled={loading}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
        title={value ? "Ocultar" : "Mostrar (queda registrado)"}
      >
        {value ? <EyeOff size={12} /> : <Eye size={12} />}
        {value ? "Ocultar" : "Mostrar"}
      </button>
      {error && <span style={{ color: "#dc2626", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
