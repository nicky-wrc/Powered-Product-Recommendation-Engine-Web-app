import type { Product } from "@/lib/api";

type Picked = Pick<Product, "tags" | "category" | "name" | "description">;

/** Fixed label if name/category/tags/description matches eco-style keywords (demo). */
export function sustainabilityBadgeLabel(p: Picked): string | null {
  const parts: string[] = [];
  if (p.category) parts.push(p.category);
  if (p.name) parts.push(p.name);
  if (p.description) parts.push(p.description);
  if (p.tags?.length) parts.push(...p.tags);
  const hay = parts.join(" ").toLowerCase();
  if (!hay.trim()) return null;

  const rules: [RegExp, string][] = [
    [/climate\s*pledge|climate\s*friendly|carbon\s*neutral/i, "Climate friendly"],
    [/organic|ออร์แกนิก/i, "Organic"],
    [/recycled|recyclable/i, "Recycled materials"],
    [/refill|refillable/i, "Refillable"],
    [/vegan/i, "Vegan"],
    [/biodegradable|compostable/i, "Biodegradable"],
    [/fair\s*trade/i, "Fair Trade"],
    [/eco[\s-]?friendly|ecofriendly|sustainable|green product|earth\s*friendly/i, "Eco-friendly"],
  ];

  for (const [re, label] of rules) {
    if (re.test(hay)) return label;
  }
  return null;
}
