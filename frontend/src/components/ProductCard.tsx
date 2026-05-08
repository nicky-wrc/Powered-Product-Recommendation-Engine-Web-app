"use client";

import Image from "next/image";
import Link from "next/link";

import { getToken, postEvent, productImageUrl, type Product } from "@/lib/api";
import { addProductToCart } from "@/lib/cartActions";

type Props = { p: Product; priority?: boolean };

export function ProductCard({ p, priority = false }: Props) {
  const img = productImageUrl(p);

  async function quickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const t = getToken();
    await addProductToCart(t, p, 1);
    if (t) {
      try {
        await postEvent(t, { product_id: p.id, event_type: "add_to_cart", metadata: { quantity: 1 } });
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700">
      <Link href={`/products/${p.id}`} className="flex min-h-0 flex-1 flex-col">
        <div className="relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-900">
          {img ? (
            <Image
              src={img}
              alt={p.name}
              fill
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              className="object-cover transition group-hover:opacity-95"
              sizes="(max-width: 768px) 100vw, 280px"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">No image</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{p.name}</p>
          {p.category ? (
            <p className="text-xs uppercase tracking-wide text-zinc-500">{p.category}</p>
          ) : null}
          <p className="mt-auto pt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            ${p.price.toFixed(2)}
          </p>
        </div>
      </Link>
      <div className="border-t border-zinc-100 p-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={(e) => void quickAdd(e)}
          className="w-full rounded-lg bg-zinc-100 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Add to cart
        </button>
      </div>
    </div>
  );
}
