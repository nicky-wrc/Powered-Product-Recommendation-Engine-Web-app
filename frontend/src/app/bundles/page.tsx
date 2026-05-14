import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { fetchProductBundles } from "@/lib/api";

export default async function BundlesPage() {
  let rows: Awaited<ReturnType<typeof fetchProductBundles>> = [];
  try {
    rows = await fetchProductBundles();
  } catch {
    rows = [];
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl space-y-10 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-50">Bundles</h1>
          <p className="mt-2 max-w-2xl text-stone-600 dark:text-stone-400">
            Buy curated sets together at a lower bundle price than adding each item separately.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-10 text-center text-stone-600 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-stone-400">
            No active bundles yet. Check back after the catalog team publishes a set.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {rows.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bundles/${b.id}`}
                  className="block rounded-2xl border border-stone-200/90 bg-white/90 p-5 shadow-sm transition hover:border-teal-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/90 dark:hover:border-teal-800"
                >
                  <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{b.name}</h2>
                  {b.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{b.description}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-baseline gap-3">
                    <span className="text-xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                      ${b.bundle_price.toFixed(2)}
                    </span>
                    {b.savings > 0 ? (
                      <span className="text-sm text-stone-500 line-through tabular-nums dark:text-stone-500">
                        ${b.list_subtotal.toFixed(2)}
                      </span>
                    ) : null}
                    {b.savings > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                        Save ${b.savings.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
