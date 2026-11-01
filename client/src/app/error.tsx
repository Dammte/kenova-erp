"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { ErrorScreen } from "@/components/feedback/ErrorScreen";

const clock = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/**
 * Design 4 «Algo ha fallado». No technical codes: the time is what a partner
 * needs to find the failure in the server log.
 */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  const [at] = useState(() => clock.format(new Date()));
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorScreen
      eyebrow="Algo ha fallado"
      title="Kenova no ha podido terminar"
      lead={`No es culpa tuya. Lo último que guardaste sigue a salvo. Vuelve a intentarlo; si se repite, avisa a un socio y dile la hora: ${at}.`}
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            Reintentar
          </Button>
          <Button variant="ghost" onClick={() => window.location.assign("/panel")}>
            Ir al Panel
          </Button>
        </>
      }
    />
  );
}
