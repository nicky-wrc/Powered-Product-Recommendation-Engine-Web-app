import type { Product } from "@/lib/api";

const CART_KEY = "recengine_cart";
export const CART_CHANGED_EVENT = "recengine-cart";

export type CartLine = {
  product_id: string;
  name: string;
  price: number;
  image_url: string | null;
  qty: number;
};

function notifyCartChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}

export function getCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is CartLine =>
        row &&
        typeof row === "object" &&
        typeof (row as CartLine).product_id === "string" &&
        typeof (row as CartLine).name === "string" &&
        typeof (row as CartLine).price === "number" &&
        typeof (row as CartLine).qty === "number",
    );
  } catch {
    return [];
  }
}

export function setCart(lines: CartLine[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(lines));
  notifyCartChanged();
}

export function clearCart() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_KEY);
  notifyCartChanged();
}

/** Total number of items (sum of quantities). */
export function cartItemCount(): number {
  return getCart().reduce((s, l) => s + l.qty, 0);
}

export function addOrMergeLine(
  product: Pick<Product, "id" | "name" | "price" | "image_url">,
  qty = 1,
) {
  const add = Math.max(1, Math.min(qty, 99));
  const cart = getCart();
  const i = cart.findIndex((l) => l.product_id === product.id);
  if (i >= 0) {
    const nextQty = Math.min(99, cart[i].qty + add);
    cart[i] = { ...cart[i], qty: nextQty };
  } else {
    cart.push({
      product_id: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      qty: add,
    });
  }
  setCart(cart);
}

export function updateLineQty(productId: string, qty: number) {
  const cart = getCart();
  const i = cart.findIndex((l) => l.product_id === productId);
  if (i < 0) return;
  if (qty < 1) {
    cart.splice(i, 1);
  } else {
    cart[i] = { ...cart[i], qty: Math.min(99, qty) };
  }
  setCart(cart);
}

export function removeLine(productId: string) {
  setCart(getCart().filter((l) => l.product_id !== productId));
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.price * l.qty, 0);
}
