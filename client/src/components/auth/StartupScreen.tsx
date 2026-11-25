"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { ErrorScreen } from "@/components/feedback/ErrorScreen";
import styles from "./StartupScreen.module.css";

/** A quick answer shows nothing; only a slow one gets a message. */
export const QUIET_MS = 800;
/** After this, say that the server may be starting up. */
export const SLOW_MS = 5000;

/**
 * What the screen shows while the session is checked, instead of a blank
 * page: the server on the free plan can take up to a minute to wake up, and
 * without a connection it keeps retrying on its own.
 */
export function StartupScreen({ unreachable, onRetry }: { unreachable: boolean; onRetry: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(timer);
  }, []);

  if (!unreachable && elapsed < QUIET_MS) return null;
  return (
    <div className={styles.page}>
      <ErrorScreen
        eyebrow="Kenova"
        title={unreachable ? "No hay conexión con el servidor" : "Conectando con el servidor…"}
        lead={
          unreachable
            ? "Lo reintentamos solo cada pocos segundos. Si dura, comprueba la conexión a internet."
            : elapsed >= SLOW_MS
              ? "La primera conexión tras un rato sin uso puede tardar hasta un minuto. No cierres la página."
              : "Un momento."
        }
        actions={
          unreachable ? (
            <Button variant="primary" onClick={onRetry}>
              Reintentar ahora
            </Button>
          ) : null
        }
      />
    </div>
  );
}
