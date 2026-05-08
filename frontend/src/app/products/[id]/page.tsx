import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductActions } from "@/components/ProductActions";
import { ProductCard } from "@/components/ProductCard";
import { SiteHeader } from "@/components/SiteHeader";
import { TrackProductView } from "@/components/TrackProductView";
import { fetchProduct, productImageUrl } from "@/lib/api";

type Props = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await fetchProduct(id);
  if (!data) notFound();
  const { product: p, similar_products } = data;
  const heroImg = productImageUrl(p);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <TrackProductView productId={p.id} />
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <nav className="text-sm text-zinc-500">
          <Link href="/products" className="hover:underline">
            Catalog
          </Link>
          <span className="px-2">/</span>
          <span className="text-zinc-900 dark:text-zinc-200">{p.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900">
            {heroImg ? (
              <Image
                src={heroImg}
                alt={p.name}
                fill
                priority
                loading="eager"
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400">No image</div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{p.category}</p>
            <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{p.name}</h1>
            <p className="text-2xl font-semibold">${p.price.toFixed(2)}</p>
            {p.description ? <p className="text-zinc-600 dark:text-zinc-400">{p.description}</p> : null}
            {p.tags?.length ? (
              <p className="text-sm text-zinc-500">Tags: {p.tags.join(", ")}</p>
            ) : null}
            <ProductActions product={p} />
          </div>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Similar products</h2>
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
