import type { Product } from "@/lib/api";

const STORAGE_KEY = "recengine_compare_v1";
const MAX_ITEMS = 4;

export const COMPARE_CHANGED_EVENT = "recengine-compare";

export type CompareItem = Pick<
  Product,
  | "id"
  | "name"
  | "price"
  | "image_url"
  | "description"
  | "category"
  | "tags"
  | "stock"
  | "base_price"
  | "compare_at_price"
  | "sale_ends_at"
>;

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMPARE_CHANGED_EVENT));
}

function toItem(p: CompareItem): CompareItem {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    base_price: p.base_price ?? p.price,
    compare_at_price: p.compare_at_price,
    sale_ends_at: p.sale_ends_at,
    image_url: p.image_url,
    description: p.description ?? null,
    category: p.category ?? null,
    tags: p.tags ?? null,
    stock: p.stock,
  };
}

export function getCompareList(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is CompareItem =>
        row &&
        typeof row === "object" &&
        typeof (row as CompareItem).id === "string" &&
        typeof (row as CompareItem).name === "string" &&
        typeof (row as CompareItem).price === "number",
    );
  } catch {
    return [];
  }
}

function setList(items: CompareItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notify();
}

export function compareCount(): number {
  return getCompareList().length;
}

export function isInCompare(productId: string): boolean {
  return getCompareList().some((x) => x.id === productId);
}

export function removeFromCompare(productId: string) {
  setList(getCompareList().filter((x) => x.id !== productId));
}

export function clearCompare() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  notify();
}

export function replaceCompareList(items: CompareItem[]) {
  setList(items.slice(0, MAX_ITEMS));
}

/** Add or remove. Returns whether item is in list after op, and if add failed due to capacity. */
export function toggleCompare(
  p: Product,
): { inCompare: boolean; atCapacity: boolean } {
  const item = toItem(p);
  const list = getCompareList();
  const exists = list.some((x) => x.id === item.id);
  if (exists) {
    setList(list.filter((x) => x.id !== item.id));
    return { inCompare: false, atCapacity: false };
  }
  if (list.length >= MAX_ITEMS) {
    return { inCompare: false, atCapacity: true };
  }
  setList([...list.filter((x) => x.id !== item.id), item].slice(0, MAX_ITEMS));
  return { inCompare: true, atCapacity: false };
}

export function compareItemToProduct(c: CompareItem): Product {
  const base = c.base_price ?? c.price;
  return {
    id: c.id,
    name: c.name,
    price: c.price,
    base_price: base,
    compare_at_price: c.compare_at_price,
    sale_ends_at: c.sale_ends_at,
    image_url: c.image_url,
    description: c.description,
    category: c.category,
    tags: c.tags,
    stock: c.stock,
  };
}
