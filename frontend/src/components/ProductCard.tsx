"use client";

import Image from "next/image";
import Link from "next/link";

import { getToken, postEvent, isLocalUploadImageUrl, productImageUrl, type Product } from "@/lib/api";
import { addProductToCart } from "@/lib/cartActions";
import { CompareToggle } from "@/components/CompareToggle";
import { useAppModal } from "@/components/AppModalProvider";
import { SustainabilityBadge } from "@/components/SustainabilityBadge";
import { WishlistHeart } from "@/components/WishlistHeart";

type Props = { p: Product; priority?: boolean };

export function ProductCard({ p, priority = false }: Props) {
  const img = productImageUrl(p);
  const { confirm } = useAppModal();

  async function quickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: "เพิ่มลงตะกร้า",
      message: `เพิ่ม "${p.name}" จำนวน 1 ชิ้น ลงตะกร้า?`,
      confirmLabel: "เพิ่ม",
      cancelLabel: "ยกเลิก",
    });
    if (!ok) return;
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
    <div className="group/card flex flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm ring-1 ring-stone-900/5 transition duration-300 hover:-translate-y-0.5 hover:border-teal-200/80 hover:shadow-lg hover:shadow-teal-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/5 dark:hover:border-teal-800/60 dark:hover:shadow-teal-900/20">
      <Link href={`/products/${p.id}`} className="flex min-h-0 flex-1 flex-col">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100 dark:bg-zinc-900">
          <WishlistHeart
            product={p}
            className="absolute right-2 top-2 z-10"
          />
          {img ? (
            <Image
              src={img}
              alt={p.name}
              fill
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              unoptimized={isLocalUploadImageUrl(p.image_url)}
              className="object-cover transition duration-500 group-hover/card:scale-[1.03]"
              sizes="(max-width: 768px) 100vw, 280px"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-stone-400">No image</div>
          )}
          {p.category ? (
            <span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600 shadow-sm backdrop-blur-sm dark:bg-zinc-950/90 dark:text-stone-300">
              {p.category}
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <SustainabilityBadge product={p} className="mb-0.5" />
          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-stone-900 dark:text-stone-50">
            {p.name}
          </p>
          <p className="mt-auto pt-2 text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
            ${p.price.toFixed(2)}
          </p>
        </div>
      </Link>
      <div className="border-t border-stone-100 p-2 dark:border-zinc-800">
        <div className="flex gap-2">
          <CompareToggle product={p} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={(e) => void quickAdd(e)}
            className="min-w-0 flex-1 rounded-xl bg-stone-900 py-2.5 text-xs font-semibold text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}
