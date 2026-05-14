import type { Product } from "@/lib/api";

const CART_KEY = "recengine_cart";
export const CART_CHANGED_EVENT = "recengine-cart";

export type CartLine = {
  product_id: string;
  variant_id?: string | null;
  /** Display: product name + optional variant */
  name: string;
  price: number;
  image_url: string | null;
  qty: number;
  with_installation?: boolean;
  installation_slot_note?: string | null;
  /** Per-unit installation fee when with_installation (for merge/sync). */
  installation_unit_fee?: number | null;
};

function lineKey(productId: string, variantId: string | null | undefined, withInstallation?: boolean): string {
  return `${productId}::${variantId ?? ""}::${withInstallation ? "1" : "0"}`;
}

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
  product: Pick<Product, "id" | "name" | "price" | "image_url"> & Partial<Pick<Product, "installation_service_price">>,
  qty = 1,
  opts?: {
    variantId?: string | null;
    lineName?: string;
    linePrice?: number;
    withInstallation?: boolean;
    installationSlotNote?: string | null;
  },
) {
  const add = Math.max(1, Math.min(qty, 99));
  const vid = opts?.variantId ?? null;
  const wi = !!opts?.withInstallation;
  const displayName = opts?.lineName ?? product.name;
  const inst = wi && product.installation_service_price != null ? product.installation_service_price : 0;
  const unitPrice = (opts?.linePrice ?? product.price) + inst;
  const instNum = wi && product.installation_service_price != null ? Number(product.installation_service_price) : null;
  const cart = getCart();
  const k = lineKey(product.id, vid, wi);
  const i = cart.findIndex((l) => lineKey(l.product_id, l.variant_id ?? null, !!l.with_installation) === k);
  if (i >= 0) {
    const nextQty = Math.min(99, cart[i].qty + add);
    cart[i] = { ...cart[i], qty: nextQty };
  } else {
    cart.push({
      product_id: product.id,
      variant_id: vid ?? undefined,
      name: displayName,
      price: unitPrice,
      image_url: product.image_url,
      qty: add,
      with_installation: wi || undefined,
      installation_slot_note: wi ? (opts?.installationSlotNote?.trim() || null) : undefined,
      installation_unit_fee: wi && instNum != null ? instNum : undefined,
    });
  }
  setCart(cart);
}

export function updateLineQty(productId: string, qty: number, variantId?: string | null, withInstallation = false) {
  const cart = getCart();
  const k = lineKey(productId, variantId ?? null, withInstallation);
  const i = cart.findIndex((l) => lineKey(l.product_id, l.variant_id ?? null, !!l.with_installation) === k);
  if (i < 0) return;
  if (qty < 1) {
    cart.splice(i, 1);
  } else {
    cart[i] = { ...cart[i], qty: Math.min(99, qty) };
  }
  setCart(cart);
}

export function removeLine(productId: string, variantId?: string | null, withInstallation = false) {
  const k = lineKey(productId, variantId ?? null, withInstallation);
  setCart(getCart().filter((l) => lineKey(l.product_id, l.variant_id ?? null, !!l.with_installation) !== k));
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.price * l.qty, 0);
}
