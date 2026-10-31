import { Suspense } from "react";
import { QuotesPage } from "@/components/quotes/QuotesPage";

export default function PresupuestosPage() {
  return (
    <Suspense>
      <QuotesPage />
    </Suspense>
  );
}
