import { postCartItem } from "@/lib/api";
import { clearCart, getCart } from "@/lib/cart";

/** Merge guest browser cart into server cart after login/register. */
export async function flushLocalCartToServer(token: string): Promise<void> {
  const lines = getCart();
  if (lines.length === 0) return;
  for (const line of lines) {
    await postCartItem(token, line.product_id, line.qty);
  }
  clearCart();
}
