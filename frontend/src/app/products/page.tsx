import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { ProductCard } from "@/components/ProductCard";
import { fetchProductCategories, fetchProducts } from "@/lib/api";

type Props = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

function catalogHref(search: string | undefined, category: string | null): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search?.trim()) params.set("q", search.trim());
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const search = sp.q;
  const category = sp.category;
  const [data, categories] = await Promise.all([
    fetchProducts({
      page: 1,
      limit: 24,
      search: search,
      category: category,
    }),
    fetchProductCategories().catch(() => [] as string[]),
  ]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 shadow-sm ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">Catalog</h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                {data.total} products
                {search ? ` · “${search}”` : ""}
                {category ? ` · ${category}` : ""}
              </p>
            </div>
            <form action="/products" method="get" className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <input type="hidden" name="category" value={category ?? ""} />
              <input
                name="q"
                placeholder="Search by name…"
                defaultValue={search ?? ""}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-inner outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-stone-50 sm:w-72"
              />
              <button
                type="submit"
                className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
              >
                Search
              </button>
            </form>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={catalogHref(search, null)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                !category
                  ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20"
                  : "border border-stone-200 bg-white text-stone-700 hover:border-teal-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-stone-300 dark:hover:border-teal-700"
              }`}
            >
              All
            </Link>
            {categories.map((c) => (
              <Link
                key={c}
                href={catalogHref(search, c)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  category === c
                    ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20"
                    : "border border-stone-200 bg-white text-stone-700 hover:border-teal-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-stone-300 dark:hover:border-teal-700"
                }`}
              >
                {c}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.products.map((p, i) => (
            <ProductCard key={p.id} p={p} priority={i < 4} />
          ))}
        </div>
      </main>
    </div>
  );
}
