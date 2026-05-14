import Link from "next/link";
import { notFound } from "next/navigation";

import { BundleAddToCart } from "@/components/BundleAddToCart";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchProductBundle, productImageUrl } from "@/lib/api";

type Props = { params: Promise<{ id: string }> };

export default async function BundleDetailPage({ params }: Props) {
  const { id } = await params;
  const b = await fetchProductBundle(id).catch(() => null);
  if (!b) notFound();

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
        <nav className="text-sm text-stone-500">
          <Link href="/bundles" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Bundles
          </Link>
          <span className="px-2 text-stone-400">/</span>
          <span className="text-stone-800 dark:text-stone-200">{b.name}</span>
        </nav>

        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-50">{b.name}</h1>
          {b.description ? (
            <p className="max-w-2xl text-stone-600 dark:text-stone-400">{b.description}</p>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
              ${b.bundle_price.toFixed(2)}
            </span>
            {b.savings > 0 ? (
              <span className="text-lg text-stone-400 line-through tabular-nums">${b.list_subtotal.toFixed(2)}</span>
            ) : null}
            {b.savings > 0 ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                You save ${b.savings.toFixed(2)}
              </span>
            ) : null}
          </div>
        </header>

        <BundleAddToCart bundleId={b.id} bundleName={b.name} />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">Included items</h2>
          <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200/90 bg-white/90 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/90">
            {b.items.map((row) => {
              const img = productImageUrl(row.product);
              const href = row.product.product_code
                ? `/products/code/${encodeURIComponent(row.product.product_code)}`
                : `/products/${row.product.id}`;
              const variant =
                row.variant_id && row.product.variants?.length
                  ? row.product.variants.find((v) => v.id === row.variant_id)
                  : undefined;
              const sub =
                variant?.label?.trim()
                  ? `${row.product.name} — ${variant.label.trim()}`
                  : row.variant_id
                    ? `${row.product.name} — variant`
                    : row.product.name;
              return (
                <li key={`${row.product_id}-${row.variant_id ?? "n"}-${row.quantity}`} className="flex gap-4 p-4">
                  <Link href={href} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-100 dark:bg-zinc-800">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={href} className="font-medium text-teal-800 hover:underline dark:text-teal-300">
                      {sub}
                    </Link>
                    <p className="text-sm text-stone-500 dark:text-stone-400">Qty in bundle: {row.quantity}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                      ${row.product.price.toFixed(2)}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">list / unit</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
