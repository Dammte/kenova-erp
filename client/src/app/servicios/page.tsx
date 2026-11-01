import { Suspense } from "react";
import { ServicesPage } from "@/components/services/ServicesPage";

// The list reads its filters and the open service from the address.
export default function ServicesRoute() {
  return (
    <Suspense>
      <ServicesPage />
    </Suspense>
  );
}
