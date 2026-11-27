"use client";

import { useParams } from "next/navigation";
import OrderPage from "@/components/orders/OrderPage";

export default function OrderRoute() {
  const { id } = useParams<{ id: string }>();
  return <OrderPage key={id} id={id} />;
}
