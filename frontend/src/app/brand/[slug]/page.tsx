import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductCard } from "@/components/ProductCard";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchProductBrands, fetchProducts } from "@/lib/api";

type Props = { params: Promise<{ slug: string }> };

const PAGE_SIZE = 48;

export default async function BrandStorefrontPage({ params }: Props) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw).trim();
  if (!slug) notFound();

  const [brands, catalog] = await Promise.all([
    fetchProductBrands().catch(() => [] as Awaited<ReturnType<typeof fetchProductBrands>>),
    fetchProducts({ brandSlug: slug, page: 1, limit: PAGE_SIZE, sort: "newest" }),
  ]);

  const meta = brands.find((b) => b.slug === slug);
  if (!meta && catalog.total === 0) notFound();

  const title = meta?.name ?? slug;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <nav className="text-sm text-stone-500">
          <Link href="/brands" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Brands
          </Link>
          <span className="px-2 text-stone-400">/</span>
          <span className="text-stone-800 dark:text-stone-200">{title}</span>
        </nav>

        <header className="rounded-3xl border border-stone-200/90 bg-gradient-to-br from-teal-50/80 to-white/90 p-6 shadow-sm dark:border-zinc-800 dark:from-teal-950/30 dark:to-zinc-950/90 md:p-8">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
            {catalog.total} item{catalog.total === 1 ? "" : "s"} in this storefront. Rich banners and brand story can plug in here later;
            the grid is live catalog data filtered by brand.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block text-sm font-semibold text-teal-700 hover:underline dark:text-teal-400"
          >
            ← Full catalog
          </Link>
        </header>

        {catalog.products.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">No products for this brand.</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {catalog.products.map((p, i) => (
              <li key={p.id}>
                <ProductCard p={p} priority={i < 4} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
