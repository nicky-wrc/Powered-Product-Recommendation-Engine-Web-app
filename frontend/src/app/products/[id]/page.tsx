import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductActions } from "@/components/ProductActions";
import { ProductCard } from "@/components/ProductCard";
import { SiteHeader } from "@/components/SiteHeader";
import { TrackProductView } from "@/components/TrackProductView";
import { fetchProduct, isLocalUploadImageUrl, productImageUrl } from "@/lib/api";

type Props = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await fetchProduct(id);
  if (!data) notFound();
  const { product: p, similar_products, bought_together } = data;
  const heroImg = productImageUrl(p);

  return (
    <div className="min-h-screen">
      <TrackProductView product={p} />
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-12 px-4 py-10">
        <nav className="text-sm text-stone-500">
          <Link href="/products" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Catalog
          </Link>
          <span className="px-2 text-stone-400">/</span>
          <span className="text-stone-800 dark:text-stone-200">{p.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-stone-200/90 bg-stone-100 shadow-xl ring-1 ring-stone-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5">
            {heroImg ? (
              <Image
                src={heroImg}
                alt={p.name}
                fill
                priority
                loading="eager"
                unoptimized={isLocalUploadImageUrl(p.image_url)}
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-stone-400">No image</div>
            )}
          </div>
          <div className="flex flex-col gap-5">
            {p.category ? (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
                {p.category}
              </p>
            ) : null}
            <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-50 md:text-4xl">
              {p.name}
            </h1>
            <div className="flex flex-wrap items-baseline gap-4">
              <p className="text-3xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                ${p.price.toFixed(2)}
              </p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  p.stock > 10
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : p.stock > 0
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                {p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}
              </span>
            </div>
            {p.description ? (
              <p className="leading-relaxed text-stone-600 dark:text-stone-400">{p.description}</p>
            ) : null}
            {p.tags?.length ? (
              <div className="flex flex-wrap gap-2">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-700 dark:bg-zinc-800 dark:text-stone-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <ProductActions product={p} />
          </div>
        </div>

        {bought_together.length > 0 ? (
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">Frequently bought together</h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">From real orders in this demo store.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {bought_together.map((bp) => (
                <ProductCard key={bp.id} p={bp} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-5">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">Similar products</h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">Same category & catalog neighbors.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar_products.map((sp) => (
              <ProductCard key={sp.id} p={sp} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
