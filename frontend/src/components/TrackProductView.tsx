"use client";

import { useEffect } from "react";

import { getToken, postEvent } from "@/lib/api";

export function TrackProductView({ productId }: { productId: string }) {
  useEffect(() => {
    const t = getToken();
    if (!t) return;
    postEvent(t, { product_id: productId, event_type: "view" }).catch(() => {});
  }, [productId]);
  return null;
}
