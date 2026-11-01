import { Suspense } from "react";
import { ShipmentsPage } from "@/components/shipments/ShipmentsPage";

// The filter, the page and the open shipment are read from the address.
export default function EnviosRoute() {
  return (
    <Suspense>
      <ShipmentsPage />
    </Suspense>
  );
}
