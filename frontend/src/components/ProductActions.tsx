"use client";

import Link from "next/link";
import { useState } from "react";

import type { Product } from "@/lib/api";
import { getToken, postEvent } from "@/lib/api";
import { addProductToCart } from "@/lib/cartActions";
import { useAppModal } from "@/components/AppModalProvider";

type Props = { product: Pick<Product, "id" | "name" | "price" | "image_url"> };

export function ProductActions({ product }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const { confirm } = useAppModal();

  async function addToCart() {
    const ok = await confirm({
      title: "เพิ่มลงตะกร้า",
      message: `เพิ่ม "${product.name}" จำนวน 1 ชิ้น ลงตะกร้า?`,
      confirmLabel: "เพิ่ม",
      cancelLabel: "ยกเลิก",
    });
    if (!ok) return;
    const t = getToken();
    setMsg(null);
    try {
      await addProductToCart(t, product, 1);
      if (t) {
        await postEvent(t, {
          product_id: product.id,
          event_type: "add_to_cart",
          metadata: { quantity: 1 },
        });
      }
      setMsg("Added to cart — open Cart to review or checkout.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not update cart.");
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-stone-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Signed-in: cart syncs to the server. Guests: items stay in this browser until you log in.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void addToCart()}
          className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50"
        >
          Add to cart
        </button>
        <Link
          href="/cart"
          className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100 dark:hover:bg-zinc-900"
        >
          View cart
        </Link>
      </div>
      {msg ? <p className="text-sm text-stone-600 dark:text-stone-400">{msg}</p> : null}
    </div>
  );
}
