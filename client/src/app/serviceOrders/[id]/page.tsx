"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * The order's page is now /ordenes/[id] (design R3 3.4); old links land there.
 */
export default function ServiceOrderRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    const id = params?.id as string;
    if (id) router.replace(`/ordenes/${id}`);
  }, [params, router]);

  return null;
}
