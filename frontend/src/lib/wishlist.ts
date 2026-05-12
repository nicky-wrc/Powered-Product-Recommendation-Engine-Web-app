import type { Product } from "@/lib/api";

const STORAGE_KEY = "recengine_wishlist_v1";
const MAX_ITEMS = 200;

export const WISHLIST_CHANGED_EVENT = "recengine-wishlist";

export type WishlistItem = {
  id: string;
  name: string;
  price: number;
  base_price?: number;
  compare_at_price?: number | null;
  sale_ends_at?: string | null;
  image_url: string | null;
  /** เก็บเมื่อมีหลายรูป (PDP / แกลเลอรี่) — รายการเก่าใน localStorage อาจไม่มีฟิลด์นี้ */
  image_urls?: string[] | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  stock: number;
  /** Set when added from PDP so quick-add can require PDP for options */
  has_variants?: boolean;
};

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WISHLIST_CHANGED_EVENT));
}

function toItem(
  p: Pick<
    Product,
    | "id"
    | "name"
    | "price"
    | "image_url"
    | "description"
    | "category"
    | "tags"
    | "stock"
    | "image_urls"
    | "base_price"
    | "compare_at_price"
    | "sale_ends_at"
    | "has_variants"
  >,
): WishlistItem {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    base_price: p.base_price ?? p.price,
    compare_at_price: p.compare_at_price,
    sale_ends_at: p.sale_ends_at,
    image_url: p.image_url,
    image_urls: p.image_urls?.length ? p.image_urls : null,
    description: p.description ?? null,
    category: p.category ?? null,
    tags: p.tags ?? null,
    stock: p.stock,
    has_variants: p.has_variants,
  };
}

export function getWishlist(): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is WishlistItem =>
        row &&
        typeof row === "object" &&
        typeof (row as WishlistItem).id === "string" &&
        typeof (row as WishlistItem).name === "string" &&
        typeof (row as WishlistItem).price === "number",
    );
  } catch {
    return [];
  }
}

function setList(items: WishlistItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notify();
}

export function isInWishlist(productId: string): boolean {
  return getWishlist().some((x) => x.id === productId);
}

export function wishlistCount(): number {
  return getWishlist().length;
}

/** Add if missing, remove if present — returns true if now in list. */
export function toggleWishlist(
  p: Pick<
    Product,
    | "id"
    | "name"
    | "price"
    | "image_url"
    | "description"
    | "category"
    | "tags"
    | "stock"
    | "image_urls"
    | "base_price"
    | "compare_at_price"
    | "sale_ends_at"
    | "has_variants"
  >,
): boolean {
  const item = toItem(p);
  const list = getWishlist();
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    const next = list.filter((x) => x.id !== item.id);
    setList(next);
    return false;
  }
  const next = [item, ...list.filter((x) => x.id !== item.id)].slice(0, MAX_ITEMS);
  setList(next);
  return true;
}

export function removeFromWishlist(productId: string) {
  setList(getWishlist().filter((x) => x.id !== productId));
}

export function wishlistItemToProduct(w: WishlistItem): Product {
  const base = w.base_price ?? w.price;
  return {
    id: w.id,
    name: w.name,
    price: w.price,
    base_price: base,
    compare_at_price: w.compare_at_price,
    sale_ends_at: w.sale_ends_at,
    image_url: w.image_url,
    image_urls: w.image_urls?.length ? w.image_urls : undefined,
    description: w.description,
    category: w.category,
    tags: w.tags,
    stock: w.stock,
    has_variants: w.has_variants,
  };
}
