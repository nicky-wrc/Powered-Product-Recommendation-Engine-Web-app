import type { Product } from "@/lib/api";

const KEY = "recengine_recent_v1";
const MAX = 10;
export const RECENT_CHANGED_EVENT = "recengine-recent";

function toProduct(s: Partial<Product> & Pick<Product, "id" | "name" | "price">): Product {
  const base = s.base_price ?? s.price;
  return {
    id: s.id,
    name: s.name,
    price: s.price,
    base_price: base,
    compare_at_price: s.compare_at_price,
    sale_ends_at: s.sale_ends_at,
    description: s.description ?? null,
    category: s.category ?? null,
    tags: s.tags ?? null,
    image_url: s.image_url ?? null,
    stock: s.stock ?? 0,
  };
}

export function recordRecentProduct(p: Product) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const list: Product[] = raw ? (JSON.parse(raw) as Product[]) : [];
    const next = [toProduct(p), ...list.filter((x) => x.id !== p.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RECENT_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearRecentProducts() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(RECENT_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function getRecentProducts(): Product[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter((x): x is Product => x && typeof x === "object" && typeof (x as Product).id === "string")
      .map((x) => toProduct(x));
  } catch {
    return [];
  }
}
