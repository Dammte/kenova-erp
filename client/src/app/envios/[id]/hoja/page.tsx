"use client";

import { useParams } from "next/navigation";
import { ShipmentSheet } from "@/components/shipments/ShipmentSheet";

export default function ShipmentSheetPage() {
  const { id } = useParams<{ id: string }>();
  return <ShipmentSheet id={id} />;
}
