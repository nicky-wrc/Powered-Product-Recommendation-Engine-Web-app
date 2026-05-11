"use client";

import { useEffect, useState } from "react";

import type { Product } from "@/lib/api";
import { isInWishlist, toggleWishlist, WISHLIST_CHANGED_EVENT } from "@/lib/wishlist";

type Props = {
  product: Pick<Product, "id" | "name" | "price" | "image_url" | "description" | "category" | "tags" | "stock">;
  className?: string;
};

export function WishlistHeart({ product, className = "" }: Props) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(isInWishlist(product.id));
    sync();
    window.addEventListener(WISHLIST_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WISHLIST_CHANGED_EVENT, sync);
  }, [product.id]);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = toggleWishlist(product);
        setOn(now);
      }}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-stone-200/90 bg-white/95 text-rose-600 shadow-sm backdrop-blur-sm transition hover:scale-105 hover:border-rose-200 hover:bg-rose-50 dark:border-zinc-600 dark:bg-zinc-950/90 dark:text-rose-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
        />
      </svg>
    </button>
  );
}
