"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui";
import { API_URL } from "@/lib/api";
import styles from "./OfflineBanner.module.css";

const RETRY_SECONDS = 5;

/**
 * Design 4 «Sin conexión»: a band over the page, not a screen, so whatever was
 * open stays visible. It retries every 5 s and goes away when the server answers.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [left, setLeft] = useState(RETRY_SECONDS);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
      if (res.ok) setOffline(false);
    } catch {
      // Still offline: try again after the next countdown.
    } finally {
      setChecking(false);
      setLeft(RETRY_SECONDS);
    }
  }, []);

  useEffect(() => {
    const goOffline = () => {
      setOffline(true);
      setLeft(RETRY_SECONDS);
    };
    const goOnline = () => setOffline(false);
    if (!navigator.onLine) goOffline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    if (!offline || checking) return;
    if (left <= 0) {
      void check();
      return;
    }
    const tick = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(tick);
  }, [offline, checking, left, check]);

  if (!offline) return null;
  return (
    <div role="status" className={styles.banner}>
      <WifiOff size={18} aria-hidden className={styles.icon} />
      <p className={styles.text}>
        <strong>Sin conexión.</strong> Lo que ya tenías abierto sigue visible. Guardar y cobrar
        volverán en cuanto haya red.
      </p>
      <span className={styles.countdown}>
        {checking ? "Comprobando…" : `Reintento automático en ${left} s`}
      </span>
      <Button size="sm" loading={checking} loadingText="Comprobando…" onClick={() => void check()}>
        Reintentar ahora
      </Button>
    </div>
  );
}
