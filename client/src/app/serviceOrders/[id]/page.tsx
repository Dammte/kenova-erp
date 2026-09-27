"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * The standalone view page has been merged into the edit page.
 * Redirect any direct access to /serviceOrders/[id] → /serviceOrders/[id]/edit
 */
export default function ServiceOrderRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    const id = params?.id as string;
    if (id) router.replace(`/serviceOrders/${id}/edit`);
  }, [params, router]);

  return null;
}
