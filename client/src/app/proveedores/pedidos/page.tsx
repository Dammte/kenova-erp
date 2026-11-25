import { Suspense } from "react";
import { SupplierOrdersPage } from "@/components/suppliers/SupplierOrdersPage";

// The filters and the open order are read from the address.
export default function SupplierOrdersRoute() {
  return (
    <Suspense>
      <SupplierOrdersPage />
    </Suspense>
  );
}
