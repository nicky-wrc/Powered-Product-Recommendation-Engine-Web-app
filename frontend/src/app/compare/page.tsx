"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { fetchProduct, formatNetworkError, isLocalUploadImageUrl, productImageUrl } from "@/lib/api";
import {
  clearCompare,
  compareCount,
  compareItemToProduct,
  COMPARE_CHANGED_EVENT,
  getCompareList,
  removeFromCompare,
  replaceCompareList,
  type CompareItem,
} from "@/lib/compare";

function TagsCell({ tags }: { tags: string[] | null }) {
  if (!tags?.length) return <span className="text-stone-400">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <li key={t} className="rounded-md bg-stone-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function ComparePage() {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => queueMicrotask(() => setItems(getCompareList()));
    sync();
    window.addEventListener(COMPARE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COMPARE_CHANGED_EVENT, sync);
  }, []);

  async function refreshFromServer() {
    const list = getCompareList();
    if (list.length === 0) return;
    setErr(null);
    setRefreshing(true);
    try {
      const next: CompareItem[] = [];
      for (const c of list) {
        const data = await fetchProduct(c.id);
        if (data?.product) {
          const p = data.product;
          next.push({
            id: p.id,
            name: p.name,
            price: p.price,
            image_url: p.image_url,
            description: p.description,
            category: p.category,
            tags: p.tags,
            stock: p.stock,
          });
        } else {
          next.push(c);
        }
      }
      replaceCompareList(next);
      setItems(next);
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setRefreshing(false);
    }
  }

  const cols = items;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">เปรียบเทียบสินค้า</h1>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              เลือกได้สูงสุด 4 ชิ้นจากแคตตาล็อกหรือหน้ารายละเอียด — ข้อมูลเก็บในเบราว์เซอร์นี้
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {cols.length > 0 ? (
              <>
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => void refreshFromServer()}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
                >
                  {refreshing ? "กำลังอัปเดต…" : "รีเฟรชราคา/สต็อก"}
                </button>
                <button
                  type="button"
                  onClick={() => clearCompare()}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                >
                  ล้างทั้งหมด
                </button>
              </>
            ) : null}
          </div>
        </div>

        {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}

        {cols.length < 2 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-6 py-12 text-center text-stone-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-stone-400">
            เลือกอย่างน้อย 2 สินค้าเพื่อเปรียบเทียบ —{" "}
            <Link href="/products" className="font-medium text-teal-700 underline dark:text-teal-400">
              ไปแคตตาล็อก
            </Link>
            {compareCount() === 1 ? " (ตอนนี้มี 1 ชิ้นในรายการ)" : null}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-stone-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <th className="sticky left-0 z-10 w-36 min-w-[9rem] bg-stone-50/95 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500 dark:bg-zinc-900/95 dark:text-stone-400">
                    รายการ
                  </th>
                  {cols.map((c) => {
                    const p = compareItemToProduct(c);
                    const img = productImageUrl(p);
                    return (
                      <th key={c.id} className="align-top px-3 py-3">
                        <div className="flex flex-col items-center gap-2">
                          <Link
                            href={`/products/${c.id}`}
                            className="relative mx-auto block h-28 w-[140px]"
                          >
                            {img ? (
                              <Image
                                src={img}
                                alt=""
                                fill
                                className="rounded-xl object-cover"
                                sizes="140px"
                                unoptimized={isLocalUploadImageUrl(c.image_url)}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center rounded-xl bg-stone-100 text-xs text-stone-400 dark:bg-zinc-800">
                                No image
                              </div>
                            )}
                          </Link>
                          <Link
                            href={`/products/${c.id}`}
                            className="line-clamp-2 text-center text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                          >
                            {c.name}
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeFromCompare(c.id)}
                            className="text-xs font-medium text-red-600 underline dark:text-red-400"
                          >
                            เอาออก
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="text-stone-800 dark:text-stone-200">
                <tr className="border-b border-stone-100 dark:border-zinc-800">
                  <th className="sticky left-0 bg-white/95 px-3 py-3 text-left text-xs font-medium text-stone-500 dark:bg-zinc-950 dark:text-stone-400">
                    ราคา
                  </th>
                  {cols.map((c) => (
                    <td
                      key={c.id}
                      className="px-3 py-3 text-center tabular-nums font-bold text-teal-700 dark:text-teal-400"
                    >
                      ${c.price.toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-stone-100 dark:border-zinc-800">
                  <th className="sticky left-0 bg-white/95 px-3 py-3 text-left text-xs font-medium text-stone-500 dark:bg-zinc-950 dark:text-stone-400">
                    หมวด
                  </th>
                  {cols.map((c) => (
                    <td key={c.id} className="px-3 py-3 text-center text-xs">
                      {c.category ?? "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-stone-100 dark:border-zinc-800">
                  <th className="sticky left-0 bg-white/95 px-3 py-3 text-left text-xs font-medium text-stone-500 dark:bg-zinc-950 dark:text-stone-400">
                    สต็อก
                  </th>
                  {cols.map((c) => (
                    <td key={c.id} className="px-3 py-3 text-center text-xs">
                      {c.stock > 0 ? `${c.stock} ชิ้น` : "หมด"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-stone-100 dark:border-zinc-800">
                  <th className="sticky left-0 align-top bg-white/95 px-3 py-3 text-left text-xs font-medium text-stone-500 dark:bg-zinc-950 dark:text-stone-400">
                    แท็ก
                  </th>
                  {cols.map((c) => (
                    <td key={c.id} className="px-3 py-3 align-top text-xs">
                      <TagsCell tags={c.tags} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="sticky left-0 align-top bg-white/95 px-3 py-3 text-left text-xs font-medium text-stone-500 dark:bg-zinc-950 dark:text-stone-400">
                    รายละเอียด
                  </th>
                  {cols.map((c) => (
                    <td
                      key={c.id}
                      className="max-w-[200px] px-3 py-3 align-top text-xs leading-relaxed text-stone-600 dark:text-stone-400"
                    >
                      {c.description?.trim() ? c.description : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <p className="text-center text-sm">
          <Link href="/products" className="font-medium text-teal-700 underline dark:text-teal-400">
            กลับแคตตาล็อก
          </Link>
        </p>
      </main>
    </div>
  );
}
