/**
 * Illustrative “viewing now” count for product detail (deterministic per id for SSR).
 * Not sourced from analytics — replace with real metrics when available.
 */
export function concurrentViewersIllustration(productId: string): number {
  let h = 2166136261;
  for (let i = 0; i < productId.length; i++) {
    h ^= productId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  return 4 + (u % 52);
}
