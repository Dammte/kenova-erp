import { Suspense } from "react";
import { InventoryPage } from "@/components/inventory/InventoryPage";

// The list reads its filters, page and open part from the address.
export default function InventoryRoute() {
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}
