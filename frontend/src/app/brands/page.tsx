import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { fetchProductBrands } from "@/lib/api";

export default async function BrandsIndexPage() {
  const brands = await fetchProductBrands().catch(() => []);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <header className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">Brands</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Browse products by brand. Link to a brand storefront mirrors Amazon-style brand pages (catalog grid for this MVP).
          </p>
        </header>

        {brands.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No brands yet — assign a <span className="font-medium">brand</span> on products in the admin catalog.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/brand/${encodeURIComponent(b.slug)}`}
                  className="block rounded-2xl border border-stone-200/90 bg-white/90 p-5 shadow-sm transition hover:border-teal-200/90 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/90 dark:hover:border-teal-800/60"
                >
                  <p className="text-lg font-semibold text-stone-900 dark:text-stone-50">{b.name}</p>
                  <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                    {b.product_count} product{b.product_count === 1 ? "" : "s"}
                  </p>
                  <p className="mt-3 text-sm font-medium text-teal-700 dark:text-teal-400">View storefront →</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
