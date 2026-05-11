import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompareToggle } from "@/components/CompareToggle";
import { ProductActions } from "@/components/ProductActions";
import { ProductCard } from "@/components/ProductCard";
import { ProductShareRow } from "@/components/ProductShareRow";
import { SiteHeader } from "@/components/SiteHeader";
import { WishlistHeart } from "@/components/WishlistHeart";
import { TrackProductView } from "@/components/TrackProductView";
import { fetchProduct, isLocalUploadImageUrl, productImageUrl } from "@/lib/api";
import { demoConcurrentViewers } from "@/lib/socialProof";
import { absoluteUrl } from "@/lib/siteUrl";
import { cache } from "react";

type Props = { params: Promise<{ id: string }> };

const getProductPageData = cache(fetchProduct);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getProductPageData(id);
  if (!data) return { title: "Product" };

  const p = data.product;
  const img = productImageUrl(p);
  const priceStr = `$${p.price.toFixed(2)}`;
  const rawDesc = p.description?.replace(/\s+/g, " ").trim() ?? "";
  const description =
    rawDesc.length > 0
      ? rawDesc.slice(0, 155) + (rawDesc.length > 155 ? "…" : "")
      : `${p.name} — ${priceStr}${p.category ? ` · ${p.category}` : ""}`;

  const images = img
    ? [
        {
          url: img,
          alt: p.name,
        },
      ]
    : undefined;

  return {
    title: p.name,
    description,
    openGraph: {
      title: p.name,
      description,
      type: "website",
      url: `/products/${p.id}`,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: p.name,
      description,
      images: images?.map((i) => i.url),
    },
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getProductPageData(id);
  if (!data) notFound();
  const { product: p, similar_products, bought_together } = data;
  const heroImg = productImageUrl(p);
  const shareUrl = absoluteUrl(`/products/${p.id}`);
  const imageAbsolute = heroImg ? absoluteUrl(heroImg) : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description ?? undefined,
    image: imageAbsolute ? [imageAbsolute] : undefined,
    offers: {
      "@type": "Offer",
      url: shareUrl,
      priceCurrency: "USD",
      price: p.price,
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
            <WishlistHeart product={p} className="absolute right-4 top-4 z-10" />
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
            <div className="flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                aria-hidden
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.463-2.782m-4.657-4.657a4.125 4.125 0 1 0-5.834 5.834 4.125 4.125 0 0 0 5.834-5.834Zm9.192 5.834a4.125 4.125 0 1 0-5.834-5.834 4.125 4.125 0 0 0 5.834 5.834Z"
                  />
                </svg>
              </span>
              <div>
                <p className="text-stone-800 dark:text-stone-200">
                  <span className="font-semibold tabular-nums text-amber-900 dark:text-amber-200">
                    {demoConcurrentViewers(p.id)}
                  </span>{" "}
                  people are viewing this item right now.
                </p>
                <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-500">
                  Demo activity indicator — not connected to real analytics.
                </p>
              </div>
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
            <ProductShareRow url={shareUrl} title={p.name} />
            <CompareToggle product={p} className="max-w-md" />
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
