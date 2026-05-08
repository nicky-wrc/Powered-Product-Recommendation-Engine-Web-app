import { postCartItem } from "@/lib/api";
import type { Product } from "@/lib/api";
import { addOrMergeLine, CART_CHANGED_EVENT } from "@/lib/cart";

export async function addProductToCart(
  token: string | null,
  product: Pick<Product, "id" | "name" | "price" | "image_url">,
  qty = 1,
) {
  const q = Math.max(1, Math.min(qty, 99));
  if (token) {
    await postCartItem(token, product.id, q);
    window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    return;
  }
  addOrMergeLine(product, q);
}
