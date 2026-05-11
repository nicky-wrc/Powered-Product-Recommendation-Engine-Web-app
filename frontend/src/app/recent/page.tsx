"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { ProductCard } from "@/components/ProductCard";
import { clearRecentProducts, getRecentProducts, RECENT_CHANGED_EVENT } from "@/lib/recentProducts";
import type { Product } from "@/lib/api";

export default function RecentProductsPage() {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    const sync = () => queueMicrotask(() => setItems(getRecentProducts()));
    sync();
    window.addEventListener(RECENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(RECENT_CHANGED_EVENT, sync);
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">สินค้าที่ดูล่าสุด</h1>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              เก็บสูงสุด 10 รายการต่อเบราว์เซอร์ — จากการเปิดหน้ารายละเอียดสินค้า
            </p>
          </div>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => clearRecentProducts()}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
            >
              ล้างประวัติ
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-6 py-12 text-center text-stone-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-stone-400">
            ยังไม่มีประวัติ —{" "}
            <Link href="/products" className="font-medium text-teal-700 underline dark:text-teal-400">
              ไปดูแคตตาล็อก
            </Link>
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((p, i) => (
              <ProductCard key={p.id} p={p} priority={i < 4} />
            ))}
          </div>
        )}

        <p className="text-center text-sm">
          <Link href="/" className="font-medium text-teal-700 underline dark:text-teal-400">
            กลับหน้าแรก
          </Link>
        </p>
      </main>
    </div>
  );
}
