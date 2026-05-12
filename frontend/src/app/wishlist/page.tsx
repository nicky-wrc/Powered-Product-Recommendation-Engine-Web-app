"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { useAppModal } from "@/components/AppModalProvider";
import { getToken, isLocalUploadImageUrl, postEvent, productImageUrl } from "@/lib/api";
import { addProductToCart } from "@/lib/cartActions";
import type { WishlistItem } from "@/lib/wishlist";
import { getWishlist, removeFromWishlist, wishlistItemToProduct, WISHLIST_CHANGED_EVENT } from "@/lib/wishlist";

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const { confirm } = useAppModal();
  const router = useRouter();

  useEffect(() => {
    const sync = () => queueMicrotask(() => setItems(getWishlist()));
    sync();
    window.addEventListener(WISHLIST_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WISHLIST_CHANGED_EVENT, sync);
  }, []);

  async function addToCart(w: WishlistItem) {
    const ok = await confirm({
      title: "เพิ่มลงตะกร้า",
      message: `เพิ่ม "${w.name}" จำนวน 1 ชิ้น ลงตะกร้า?`,
      confirmLabel: "เพิ่ม",
      cancelLabel: "ยกเลิก",
    });
    if (!ok) return;
    const t = getToken();
    if (w.has_variants) {
      router.push(`/products/${w.id}`);
      return;
    }
    const p = wishlistItemToProduct(w);
    await addProductToCart(t, p, 1);
    if (t) {
      try {
        await postEvent(t, { product_id: w.id, event_type: "add_to_cart", metadata: { quantity: 1, from: "wishlist" } });
      } catch {
        /* ignore */
      }
    }
  }

  async function removeItem(w: WishlistItem) {
    const ok = await confirm({
      title: "เอาออกจาก Wishlist",
      message: `เอา "${w.name}" ออกจากรายการโปรด?`,
      confirmLabel: "เอาออก",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    removeFromWishlist(w.id);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-50">Wishlist</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Saved on this device.{" "}
            <Link href="/products" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
              Browse catalog
            </Link>
          </p>
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-6 py-12 text-center text-stone-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-stone-400">
            No items yet — tap the heart on a product card or detail page.
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((w) => {
              const img = productImageUrl(wishlistItemToProduct(w));
              return (
                <li
                  key={w.id}
                  className="flex flex-col gap-4 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:gap-6"
                >
                  <Link href={`/products/${w.id}`} className="relative mx-auto h-28 w-36 shrink-0 overflow-hidden rounded-xl bg-stone-100 dark:bg-zinc-900 sm:mx-0">
                    {img ? (
                      <Image
                        src={img}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="144px"
                        unoptimized={isLocalUploadImageUrl(w.image_url)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-stone-400">No image</div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link href={`/products/${w.id}`} className="font-semibold text-stone-900 hover:underline dark:text-stone-100">
                      {w.name}
                    </Link>
                    <div className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
                      {w.compare_at_price != null && w.compare_at_price > w.price ? (
                        <span className="mr-2 text-sm font-normal text-stone-400 line-through dark:text-stone-500">
                          ${w.compare_at_price.toFixed(2)}
                        </span>
                      ) : null}
                      ${w.price.toFixed(2)}
                    </div>
                    {w.stock <= 0 ? (
                      <p className="text-xs font-medium text-red-600 dark:text-red-400">Out of stock</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                    <button
                      type="button"
                      onClick={() => void addToCart(w)}
                      disabled={w.stock <= 0}
                      className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400"
                    >
                      Add to cart
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeItem(w)}
                      className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-300 dark:hover:bg-zinc-800"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
