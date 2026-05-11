"use client";

import { useEffect } from "react";

import type { Product } from "@/lib/api";
import { getToken, postEvent } from "@/lib/api";
import { recordRecentProduct } from "@/lib/recentProducts";

export function TrackProductView({ product }: { product: Product }) {
  useEffect(() => {
    recordRecentProduct(product);
    const t = getToken();
    if (!t) return;
    postEvent(t, { product_id: product.id, event_type: "view" }).catch(() => {});
  }, [product]);
  return null;
}
