import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { ProductCard } from "@/components/ProductCard";
import { fetchProducts } from "@/lib/api";

type Props = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const search = sp.q;
  const category = sp.category;
  const data = await fetchProducts({
    page: 1,
    limit: 24,
    search: search,
    category: category,
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Catalog</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {data.total} products
              {search ? ` · search “${search}”` : ""}
              {category ? ` · ${category}` : ""}
            </p>
          </div>
          <form action="/products" method="get" className="flex gap-2">
            <input type="hidden" name="category" value={category ?? ""} />
            <input
              name="q"
              placeholder="Search name…"
              defaultValue={search ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:w-64"
            />
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              Search
            </button>
          </form>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {["shoes", "bags", "apparel", "electronics", "accessories", "home"].map((c) => (
            <Link
              key={c}
              href={category === c ? "/products" : `/products?category=${c}`}
              className={`rounded-full px-3 py-1 ${
                category === c
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
              }`}
            >
              {c}
            </Link>
          ))}
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
