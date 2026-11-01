import { Suspense } from "react";
import { StoresPage } from "@/components/stores/StoresPage";

// The open store is read from the address.
export default function TiendaRoute() {
  return (
    <Suspense>
      <StoresPage />
    </Suspense>
  );
}
