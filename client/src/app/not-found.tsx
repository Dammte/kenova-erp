"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui";
import { ErrorScreen, errorStyles } from "@/components/feedback/ErrorScreen";
import { OPEN_SEARCH_EVENT } from "@/components/shell/BottomBar";

/** Design 4: a wrong link or a deleted order. */
export default function NotFound() {
  const router = useRouter();
  return (
    <ErrorScreen
      eyebrow="Página no encontrada"
      title="Esta página no existe"
      lead="Puede que el enlace esté mal copiado o que la orden se haya eliminado. Búscala por número, nombre o teléfono."
      actions={
        <>
          <Button variant="primary" onClick={() => router.push("/panel")}>
            Ir al Panel
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>
            Volver atrás
          </Button>
        </>
      }
    >
      <button
        type="button"
        className={errorStyles.search}
        onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
      >
        <Search size={16} aria-hidden />
        Buscar orden, cliente o teléfono…
      </button>
    </ErrorScreen>
  );
}
