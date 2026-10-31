import { Suspense } from "react";
import OrderList from "@/components/orders/OrderList";

// The list reads its tab and search from the address (useSearchParams).
export default function OrdersPage() {
  return (
    <Suspense>
      <OrderList />
    </Suspense>
  );
}
