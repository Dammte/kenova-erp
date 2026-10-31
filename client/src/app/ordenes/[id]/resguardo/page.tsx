"use client";

import { useParams } from "next/navigation";
import { ReceiptPage } from "@/components/receipt/ReceiptPage";

export default function OrderReceiptPage() {
  const { id } = useParams<{ id: string }>();
  return <ReceiptPage id={id} />;
}
