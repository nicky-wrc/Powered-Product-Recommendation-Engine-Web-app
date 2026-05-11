"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/api";
import { getRecentProducts, RECENT_CHANGED_EVENT } from "@/lib/recentProducts";

export function RecentStrip() {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    const sync = () => queueMicrotask(() => setItems(getRecentProducts()));
    sync();
    window.addEventListener(RECENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(RECENT_CHANGED_EVENT, sync);
  }, []);

  if (items.length === 0) return null;

  const preview = items.slice(0, 4);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Recently viewed
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            สูงสุด 10 รายการในเบราว์เซอร์นี้ — อัปเดตเมื่อเปิดหน้ารายละเอียดสินค้า
          </p>
        </div>
        <Link
          href="/recent"
          className="shrink-0 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-400"
        >
          ดูทั้งหมด ({items.length})
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {preview.map((p, i) => (
          <ProductCard key={p.id} p={p} priority={i < 2} />
        ))}
      </div>
    </section>
  );
}
