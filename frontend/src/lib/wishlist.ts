import type { Product } from "@/lib/api";

const STORAGE_KEY = "recengine_wishlist_v1";
const MAX_ITEMS = 200;

export const WISHLIST_CHANGED_EVENT = "recengine-wishlist";

export type WishlistItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  stock: number;
};

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WISHLIST_CHANGED_EVENT));
}

function toItem(p: Pick<Product, "id" | "name" | "price" | "image_url" | "description" | "category" | "tags" | "stock">): WishlistItem {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    image_url: p.image_url,
    description: p.description ?? null,
    category: p.category ?? null,
    tags: p.tags ?? null,
    stock: p.stock,
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
  p: Pick<Product, "id" | "name" | "price" | "image_url" | "description" | "category" | "tags" | "stock">,
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
  return {
    id: w.id,
    name: w.name,
    price: w.price,
    image_url: w.image_url,
    description: w.description,
    category: w.category,
    tags: w.tags,
    stock: w.stock,
  };
}
