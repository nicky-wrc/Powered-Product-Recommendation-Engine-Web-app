"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import { fetchProducts, formatNetworkError, type CatalogSort, type Product } from "@/lib/api";

type Props = {
  initialProducts: Product[];
  initialTotal: number;
  initialTotalPages: number;
  initialPage: number;
  initialSort: CatalogSort;
  pageSize: number;
};

function replaceDealsUrl(page: number, sort: CatalogSort) {
  const p = new URLSearchParams();
  if (page > 1) p.set("page", String(page));
  if (sort !== "newest") p.set("sort", sort);
  const qs = p.toString();
  const path = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", path);
}

export function DealsHubView({
  initialProducts,
  initialTotal,
  initialTotalPages,
  initialPage,
  initialSort,
  pageSize,
}: Props) {
  const [sort, setSort] = useState<CatalogSort>(initialSort);
  const [page, setPage] = useState(initialPage);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(Math.max(1, initialTotalPages));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const skipOnce = useRef(true);

  const runFetch = useCallback(
    async (pageNum: number, sortOrder: CatalogSort) => {
      setLoading(true);
      setErr(null);
      try {
        let r = await fetchProducts({
          page: pageNum,
          limit: pageSize,
          onSale: true,
          sort: sortOrder,
        });
        const tp = Math.max(1, r.total_pages);
        let current = pageNum;
        if (tp > 0 && pageNum > tp) {
          current = tp;
          setPage(tp);
          r = await fetchProducts({
            page: current,
            limit: pageSize,
            onSale: true,
            sort: sortOrder,
          });
        }
        setProducts(r.products);
        setTotal(r.total);
        setTotalPages(Math.max(1, r.total_pages));
        replaceDealsUrl(current, sortOrder);
      } catch (e) {
        setErr(formatNetworkError(e));
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    if (skipOnce.current) {
      skipOnce.current = false;
      return;
    }
    void runFetch(page, sort);
  }, [page, sort, runFetch]);

  return (
    <>
      <div className="rounded-3xl border border-amber-200/90 bg-gradient-to-br from-amber-50 via-white/80 to-rose-50/60 p-6 shadow-sm ring-1 ring-amber-900/5 dark:border-amber-900/40 dark:from-amber-950/30 dark:via-zinc-950/80 dark:to-rose-950/20 md:p-8">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-stone-600 dark:text-stone-400">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-teal-700 hover:underline dark:hover:text-teal-400">
                Home
              </Link>
            </li>
            <li className="text-stone-400 dark:text-stone-500" aria-hidden>
              /
            </li>
            <li aria-current="page" className="font-medium text-stone-800 dark:text-stone-200">
              Deals
            </li>
          </ol>
        </nav>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">Today&apos;s deals</p>
            <h1 className="mt-1 text-2xl font-bold text-stone-900 dark:text-stone-50 md:text-3xl">Flash sale &amp; limited-time prices</h1>
            <p className="mt-2 max-w-xl text-sm text-stone-600 dark:text-stone-400">
              สินค้าที่ลดอยู่ตอนนี้ — แสดงเฉพาะดีลที่ยังไม่หมดเวลา
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-stone-600 dark:text-stone-400">เรียง</label>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as CatalogSort);
                setPage(1);
              }}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
            >
              <option value="newest">ใหม่ล่าสุด</option>
              <option value="price_asc">ราคา ↑</option>
              <option value="price_desc">ราคา ↓</option>
              <option value="name_asc">ชื่อ A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600 dark:text-stone-400">
        <p>
          {total === 0 ? "ไม่มีดีลในขณะนี้" : `พบ ${total} รายการ`}
          {loading ? " · กำลังโหลด…" : null}
        </p>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-stone-200 px-3 py-1 text-xs font-medium disabled:opacity-40 dark:border-zinc-600"
            >
              ก่อนหน้า
            </button>
            <span className="text-xs">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-stone-200 px-3 py-1 text-xs font-medium disabled:opacity-40 dark:border-zinc-600"
            >
              ถัดไป
            </button>
          </div>
        ) : null}
      </div>

      {products.length === 0 && !loading ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center text-sm text-stone-500 dark:border-zinc-700 dark:text-stone-400">
          ยังไม่มีสินค้าที่ลดราคาอยู่ — ลองดู{" "}
          <Link href="/products" className="font-semibold text-teal-700 underline dark:text-teal-400">
            แคตตาล็อกทั้งหมด
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
