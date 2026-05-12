import { fetchCart, postCartItem } from "@/lib/api";
import { clearCart, getCart, setCart, type CartLine } from "@/lib/cart";

/** Merge guest browser cart into server cart after login/register. */
export async function flushLocalCartToServer(token: string): Promise<void> {
  const lines = getCart();
  if (lines.length === 0) return;
  for (const line of lines) {
    await postCartItem(token, line.product_id, line.qty, line.variant_id ?? null);
  }
  clearCart();
}

/** Copy server cart into local storage before logout so the user keeps items as a guest (same browser). */
export async function dumpServerCartToLocal(token: string): Promise<void> {
  const c = await fetchCart(token);
  const lines: CartLine[] = c.items.map((i) => {
    const label = i.variant_label ? `${i.product.name} — ${i.variant_label}` : i.product.name;
    return {
      product_id: i.product.id,
      variant_id: i.variant_id ?? undefined,
      name: label,
      price: i.unit_price,
      image_url: i.product.image_url,
      qty: Math.max(1, Math.min(99, i.quantity)),
    };
  });
  setCart(lines);
}
