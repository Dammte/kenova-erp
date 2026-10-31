"use client";

import { useParams } from "next/navigation";
import { QuotePrintPage } from "@/components/quotes/QuotePrintPage";

export default function QuotePrintRoute() {
  const { id } = useParams<{ id: string }>();
  return <QuotePrintPage id={id} />;
}
