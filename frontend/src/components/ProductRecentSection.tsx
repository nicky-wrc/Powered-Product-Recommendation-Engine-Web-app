"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/api";
import { getRecentProducts, RECENT_CHANGED_EVENT } from "@/lib/recentProducts";

type Props = { currentProductId: string };

/** การ์ดบน PDP — ไม่แสดงสินค้าที่กำลังเปิดอยู่ */
export function ProductRecentSection({ currentProductId }: Props) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    const sync = () => {
      const rest = getRecentProducts().filter((p) => p.id !== currentProductId);
      queueMicrotask(() => setItems(rest));
    };
    sync();
    window.addEventListener(RECENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(RECENT_CHANGED_EVENT, sync);
  }, [currentProductId]);

  if (items.length === 0) return null;

  const preview = items.slice(0, 4);

  return (
    <section className="space-y-5 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">เพิ่งดูล่าสุด</h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            สินค้าที่เปิดบนหน้ารายละเอียดในเบราว์เซอร์นี้ (สูงสุด 10 รายการ) — ไม่รวมสินค้าที่คุณกำลังดูอยู่
          </p>
        </div>
        <Link
          href="/recent"
          className="shrink-0 text-sm font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
        >
          ดูทั้งหมด ({items.length})
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {preview.map((product, i) => (
          <ProductCard key={product.id} p={product} priority={i < 2} />
        ))}
      </div>
    </section>
  );
}
