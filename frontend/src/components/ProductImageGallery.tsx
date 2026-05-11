"use client";

import Image from "next/image";
import { useState } from "react";

import { isLocalUploadImageUrl, productGalleryUrls, type Product } from "@/lib/api";

type Props = { product: Product; wishlistSlot?: React.ReactNode };

export function ProductImageGallery({ product, wishlistSlot }: Props) {
  const urls = productGalleryUrls(product);
  const [idx, setIdx] = useState(0);

  if (urls.length === 0) {
    return (
      <div className="relative flex h-full min-h-[16rem] items-center justify-center text-stone-400">
        {wishlistSlot ? <span className="absolute right-4 top-4 z-10">{wishlistSlot}</span> : null}
        No image
      </div>
    );
  }

  const safeIdx = Math.min(idx, urls.length - 1);
  const src = urls[safeIdx] ?? urls[0];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative min-h-0 flex-1">
        {wishlistSlot ? <span className="absolute right-4 top-4 z-10">{wishlistSlot}</span> : null}
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-stone-200/90 bg-stone-100 shadow-xl ring-1 ring-stone-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5">
          <Image
            src={src}
            alt={product.name}
            fill
            priority
            loading="eager"
            unoptimized={isLocalUploadImageUrl(src)}
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </div>
      </div>
      {urls.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {urls.map((u, i) => (
            <button
              key={`${u}-${i}`}
              type="button"
              onClick={() => setIdx(i)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                i === safeIdx
                  ? "border-teal-500 ring-2 ring-teal-500/30"
                  : "border-stone-200/80 opacity-90 hover:opacity-100 dark:border-zinc-600"
              }`}
            >
              <Image
                src={u}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
                unoptimized={isLocalUploadImageUrl(u)}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
