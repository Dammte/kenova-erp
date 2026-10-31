import { Suspense } from "react";
import { ClientsPage } from "@/components/clients/ClientsPage";

// The list reads its tab, search, page and open client from the address.
export default function ClientsRoute() {
  return (
    <Suspense>
      <ClientsPage />
    </Suspense>
  );
}
