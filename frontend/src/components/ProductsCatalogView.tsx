"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import { fetchProducts, formatNetworkError, type Product } from "@/lib/api";

type Props = {
  categories: string[];
  initialProducts: Product[];
  initialTotal: number;
  initialTotalPages: number;
  initialPage: number;
  initialQ: string;
  initialCategory: string | undefined;
  pageSize: number;
};

function replaceCatalogUrl(q: string, category: string | undefined, page: number) {
  const p = new URLSearchParams();
  if (category) p.set("category", category);
  const t = q.trim();
  if (t) p.set("q", t);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  const path = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", path);
}

export function ProductsCatalogView({
  categories,
  initialProducts,
  initialTotal,
  initialTotalPages,
  initialPage,
  initialQ,
  initialCategory,
  pageSize,
}: Props) {
  const [query, setQuery] = useState(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQ);
  const [category, setCategory] = useState<string | undefined>(initialCategory);
  const [page, setPage] = useState(initialPage);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const skipFetchOnce = useRef(true);
  const filtersMounted = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setPage(1);
  }, [debouncedQuery, category]);

  const runFetch = useCallback(
    async (q: string, cat: string | undefined, pageNum: number) => {
      setLoading(true);
      setErr(null);
      try {
        let r = await fetchProducts({
          page: pageNum,
          limit: pageSize,
          search: q.trim() || undefined,
          category: cat || undefined,
        });
        const tp = Math.max(1, r.total_pages);
        let currentPage = pageNum;
        if (tp > 0 && pageNum > tp) {
          currentPage = tp;
          setPage(tp);
          r = await fetchProducts({
            page: currentPage,
            limit: pageSize,
            search: q.trim() || undefined,
            category: cat || undefined,
          });
        }
        setProducts(r.products);
        setTotal(r.total);
        setTotalPages(Math.max(1, r.total_pages));
        replaceCatalogUrl(q, cat, currentPage);
      } catch (e) {
        setErr(formatNetworkError(e));
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    if (skipFetchOnce.current) {
      skipFetchOnce.current = false;
      return;
    }
    void runFetch(debouncedQuery, category, page);
  }, [debouncedQuery, category, page, runFetch]);

  function selectCategory(next: string | undefined) {
    setCategory(next);
  }

  const displayQ = query.trim();
  const subtitleCat = category ?? "";
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <>
      <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 shadow-sm ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">Catalog</h1>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              {loading ? "Updating…" : `${total} products`}
              {!loading && displayQ ? ` · “${displayQ}”` : ""}
              {!loading && subtitleCat ? ` · ${subtitleCat}` : ""}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <label className="sr-only" htmlFor="catalog-search">
              Search products
            </label>
            <input
              id="catalog-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Search products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-inner outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-stone-50 sm:min-w-[16rem] sm:max-w-md"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => selectCategory(undefined)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              !category
                ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20"
                : "border border-stone-200 bg-white text-stone-700 hover:border-teal-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-stone-300 dark:hover:border-teal-700"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => selectCategory(c)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                category === c
                  ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20"
                  : "border border-stone-200 bg-white text-stone-700 hover:border-teal-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-stone-300 dark:hover:border-teal-700"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {err ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </p>
        ) : null}
      </div>

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${loading ? "pointer-events-none opacity-60" : ""}`}
        aria-busy={loading}
      >
        {products.length === 0 && !loading ? (
          <p className="col-span-full py-12 text-center text-sm text-stone-500 dark:text-stone-400">
            No products match your filters.
          </p>
        ) : (
          products.map((p, i) => <ProductCard key={p.id} p={p} priority={page === 1 && i < 4} />)
        )}
      </div>

      {total > 0 && totalPages > 1 ? (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-200/80 pt-6 dark:border-zinc-800 sm:flex-row">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Showing{" "}
            <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">{rangeStart}</span>
            –
            <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">{rangeEnd}</span>
            {" of "}
            <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">{total}</span>
            <span className="text-stone-500">
              {" · Page "}
              {page} / {totalPages}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
