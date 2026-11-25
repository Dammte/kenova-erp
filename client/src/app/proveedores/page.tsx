import { Suspense } from "react";
import { SuppliersPage } from "@/components/suppliers/SuppliersPage";

// The open supplier is read from the address.
export default function ProveedoresRoute() {
  return (
    <Suspense>
      <SuppliersPage />
    </Suspense>
  );
}
