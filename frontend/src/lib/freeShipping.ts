/**
 * Demo “free shipping” threshold in the same currency as product prices (store uses USD-style $ in UI).
 * Override with NEXT_PUBLIC_FREE_SHIPPING_MIN_SUBTOTAL in .env
 */
export function getFreeShippingThreshold(): number {
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_FREE_SHIPPING_MIN_SUBTOTAL != null
      ? String(process.env.NEXT_PUBLIC_FREE_SHIPPING_MIN_SUBTOTAL).trim()
      : "";
  if (raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 49;
}

export function freeShippingProgress(subtotal: number): {
  threshold: number;
  remaining: number;
  qualified: boolean;
  percent: number;
} {
  const threshold = getFreeShippingThreshold();
  const qualified = subtotal >= threshold;
  const remaining = qualified ? 0 : Math.max(0, threshold - subtotal);
  const percent = threshold <= 0 ? 100 : Math.min(100, Math.max(0, (subtotal / threshold) * 100));
  return { threshold, remaining, qualified, percent };
}
