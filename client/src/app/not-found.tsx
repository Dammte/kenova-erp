"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ErrorScreen } from "@/components/feedback/ErrorScreen";

/**
 * A link that leads nowhere goes straight to the Panel. Without a session the
 * middleware has already sent it to the login, which comes back here after.
 */
export default function NotFound() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/panel");
  }, [router]);
  return (
    <ErrorScreen
      eyebrow="Página no encontrada"
      title="Te llevamos al Panel…"
      lead="Esta dirección no existe en Kenova."
      actions={
        <Button variant="primary" onClick={() => router.replace("/panel")}>
          Ir al Panel
        </Button>
      }
    />
  );
}
