/**
 * Deterministic “viewing now” count for demo social proof (product detail).
 * Not real traffic — stable per product id for SSR and refresh.
 */
export function demoConcurrentViewers(productId: string): number {
  let h = 2166136261;
  for (let i = 0; i < productId.length; i++) {
    h ^= productId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  return 4 + (u % 52);
}
