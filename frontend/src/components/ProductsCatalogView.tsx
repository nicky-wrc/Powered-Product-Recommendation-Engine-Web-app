"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import { fetchProducts, fetchProductSuggestions, formatNetworkError, type CatalogSort, type Product, type ProductSuggestion } from "@/lib/api";

type Props = {
  categories: string[];
  initialProducts: Product[];
  initialTotal: number;
  initialTotalPages: number;
  initialPage: number;
  initialQ: string;
  initialCategory: string | undefined;
  initialSort: CatalogSort;
  initialMinPrice: number | undefined;
  initialMaxPrice: number | undefined;
  pageSize: number;
};

type CatalogPriceFilter = { min?: number; max?: number };

function normalizePriceFilter(min?: number, max?: number): CatalogPriceFilter {
  if (min != null && max != null && min > max) return { min: max, max: min };
  return { min, max };
}

function replaceCatalogUrl(
  q: string,
  category: string | undefined,
  page: number,
  sort: CatalogSort,
  prices: CatalogPriceFilter,
) {
  const p = new URLSearchParams();
  if (category) p.set("category", category);
  const t = q.trim();
  if (t) p.set("q", t);
  if (page > 1) p.set("page", String(page));
  if (sort !== "newest") p.set("sort", sort);
  if (prices.min != null) p.set("min_price", String(prices.min));
  if (prices.max != null) p.set("max_price", String(prices.max));
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
  initialSort,
  initialMinPrice,
  initialMaxPrice,
  pageSize,
}: Props) {
  const [query, setQuery] = useState(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQ);
  const [category, setCategory] = useState<string | undefined>(initialCategory);
  const [sort, setSort] = useState<CatalogSort>(initialSort);
  const [minPriceInput, setMinPriceInput] = useState(
    initialMinPrice != null ? String(initialMinPrice) : "",
  );
  const [maxPriceInput, setMaxPriceInput] = useState(
    initialMaxPrice != null ? String(initialMaxPrice) : "",
  );
  const [debouncedPrices, setDebouncedPrices] = useState<CatalogPriceFilter>(() =>
    normalizePriceFilter(initialMinPrice, initialMaxPrice),
  );
  const [page, setPage] = useState(initialPage);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const skipFetchOnce = useRef(true);
  const filtersMounted = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const tid = window.setTimeout(() => {
      const parse = (s: string): number | undefined => {
        const t = s.trim();
        if (!t) return undefined;
        const n = Number.parseFloat(t);
        if (!Number.isFinite(n) || n < 0) return undefined;
        return n;
      };
      setDebouncedPrices(normalizePriceFilter(parse(minPriceInput), parse(maxPriceInput)));
    }, 400);
    return () => window.clearTimeout(tid);
  }, [minPriceInput, maxPriceInput]);

  useEffect(() => {
    const q = query.trim();
    const ac = new AbortController();
    const tid = window.setTimeout(() => {
      if (q.length < 1) {
        setSuggestions([]);
        return;
      }
      void fetchProductSuggestions(q, ac.signal)
        .then((rows) => setSuggestions(rows))
        .catch(() => {
          if (!ac.signal.aborted) setSuggestions([]);
        });
    }, 200);
    return () => {
      ac.abort();
      window.clearTimeout(tid);
    };
  }, [query]);

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setPage(1);
  }, [debouncedQuery, category, debouncedPrices.min, debouncedPrices.max]);

  const runFetch = useCallback(
    async (
      q: string,
      cat: string | undefined,
      pageNum: number,
      sortOrder: CatalogSort,
      prices: CatalogPriceFilter,
    ) => {
      setLoading(true);
      setErr(null);
      try {
        let r = await fetchProducts({
          page: pageNum,
          limit: pageSize,
          search: q.trim() || undefined,
          category: cat || undefined,
          sort: sortOrder,
          minPrice: prices.min,
          maxPrice: prices.max,
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
            sort: sortOrder,
            minPrice: prices.min,
            maxPrice: prices.max,
          });
        }
        setProducts(r.products);
        setTotal(r.total);
        setTotalPages(Math.max(1, r.total_pages));
        replaceCatalogUrl(q, cat, currentPage, sortOrder, prices);
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
    void runFetch(debouncedQuery, category, page, sort, {
      min: debouncedPrices.min,
      max: debouncedPrices.max,
    });
  }, [debouncedQuery, category, page, sort, debouncedPrices.min, debouncedPrices.max, runFetch]);

  function selectCategory(next: string | undefined) {
    setCategory(next);
  }

  function selectSort(next: CatalogSort) {
    setSort(next);
    setPage(1);
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
              {!loading && debouncedPrices.min != null ? ` · min $${debouncedPrices.min.toFixed(2)}` : ""}
              {!loading && debouncedPrices.max != null ? ` · max $${debouncedPrices.max.toFixed(2)}` : ""}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <label className="sr-only" id="catalog-search-label" htmlFor="catalog-search">
              Search products
            </label>
            <div className="relative w-full sm:min-w-[16rem] sm:max-w-md">
              <input
                id="catalog-search"
                type="search"
                role="combobox"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Search products…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestOpen(false), 180)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSuggestOpen(false);
                }}
                aria-autocomplete="list"
                aria-expanded={suggestOpen && suggestions.length > 0}
                aria-controls="catalog-search-suggestions"
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-inner outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-stone-50"
              />
              {suggestOpen && suggestions.length > 0 ? (
                <ul
                  id="catalog-search-suggestions"
                  role="listbox"
                  aria-labelledby="catalog-search-label"
                  className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {suggestions.map((s) => (
                    <li key={s.id} role="option" aria-selected="false">
                      <Link
                        href={`/products/${s.id}`}
                        className="flex flex-col gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-teal-50 dark:hover:bg-teal-950/50"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <span className="font-medium text-stone-900 dark:text-stone-100">{s.name}</span>
                        {s.category ? (
                          <span className="text-xs text-stone-500 dark:text-stone-400">{s.category}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
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
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-stone-200/80 pt-4 dark:border-zinc-800">
          <div className="flex flex-col gap-1">
            <label htmlFor="catalog-min-price" className="text-xs font-medium text-stone-600 dark:text-stone-400">
              Min price
            </label>
            <input
              id="catalog-min-price"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="Any"
              value={minPriceInput}
              onChange={(e) => setMinPriceInput(e.target.value)}
              className="w-28 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm tabular-nums text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-stone-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="catalog-max-price" className="text-xs font-medium text-stone-600 dark:text-stone-400">
              Max price
            </label>
            <input
              id="catalog-max-price"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="Any"
              value={maxPriceInput}
              onChange={(e) => setMaxPriceInput(e.target.value)}
              className="w-28 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm tabular-nums text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-stone-100"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setMinPriceInput("");
              setMaxPriceInput("");
            }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-stone-300 dark:hover:bg-zinc-800"
          >
            Clear prices
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-stone-200/80 pt-4 dark:border-zinc-800">
          <label
            htmlFor="catalog-sort"
            className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400"
          >
            Sort by
          </label>
          <select
            id="catalog-sort"
            value={sort}
            onChange={(e) => selectSort(e.target.value as CatalogSort)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-stone-100"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name_asc">Name A–Z</option>
          </select>
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
