"use client";

import Link from "next/link";
import { useState } from "react";

import type { Product } from "@/lib/api";
import { getToken, postEvent } from "@/lib/api";
import { addProductToCart } from "@/lib/cartActions";

type Props = { product: Pick<Product, "id" | "name" | "price" | "image_url"> };

export function ProductActions({ product }: Props) {
  const [msg, setMsg] = useState<string | null>(null);

  async function addToCart() {
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
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Views are tracked when you open this page (when logged in). Cart is stored on the server when you are signed
        in; guests use browser storage until they log in.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void addToCart()}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Add to cart
        </button>
        <Link
          href="/cart"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          View cart
        </Link>
      </div>
      {msg ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
    </div>
  );
}
