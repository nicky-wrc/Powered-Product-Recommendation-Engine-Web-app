import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductCard } from "@/components/ProductCard";
import { GiftRegistryShareActions } from "@/components/GiftRegistryShareActions";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchGiftRegistryBySlug } from "@/lib/api";
import { absoluteUrl } from "@/lib/siteUrl";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  try {
    const d = await fetchGiftRegistryBySlug(slug);
    const desc = (d.description ?? "").replace(/\s+/g, " ").trim().slice(0, 155);
    return {
      title: `${d.title} · Gift list`,
      description: desc || `${d.title} — shared gift registry`,
      openGraph: {
        title: d.title,
        description: desc || undefined,
        type: "website",
        url: `/gift-registry/${encodeURIComponent(d.slug)}`,
      },
    };
  } catch {
    return { title: "Gift list" };
  }
}

export default async function GiftRegistryPublicPage({ params }: Props) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  let data;
  try {
    data = await fetchGiftRegistryBySlug(slug);
  } catch {
    notFound();
  }
  const shareUrl = absoluteUrl(`/gift-registry/${encodeURIComponent(data.slug)}`);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-3 py-6 sm:space-y-10 sm:px-4 sm:py-10">
        <nav className="text-sm text-stone-500">
          <Link
            href="/products"
            className="font-medium text-teal-700 hover:underline dark:text-teal-400"
          >
            Catalog
          </Link>
          <span className="px-2 text-stone-400">/</span>
          <span className="text-stone-800 dark:text-stone-200">Gift list</span>
        </nav>

        <header className="space-y-3 sm:space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl dark:text-stone-50">
            {data.title}
          </h1>
          {data.owner_display_name ? (
            <p className="text-sm text-stone-600 dark:text-stone-400">จัดทำโดย {data.owner_display_name}</p>
          ) : null}
          {data.event_date ? (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              วันกิจกรรม:{" "}
              <span className="tabular-nums font-medium text-stone-800 dark:text-stone-200">
                {data.event_date}
              </span>
            </p>
          ) : null}
          {data.description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              {data.description}
            </p>
          ) : null}
          <div className="flex flex-col gap-4 rounded-xl border border-stone-200/80 bg-stone-50/50 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0 dark:border-zinc-800 dark:bg-zinc-950/40 sm:dark:border-0 sm:dark:bg-transparent">
            <p className="min-w-0 text-[11px] leading-relaxed text-stone-500 dark:text-stone-500">
              แชร์ลิงก์:{" "}
              <span className="break-all font-mono text-[11px] text-stone-700 dark:text-stone-300">
                {shareUrl}
              </span>
            </p>
            <div className="shrink-0 sm:pt-0.5">
              <GiftRegistryShareActions shareUrl={shareUrl} />
            </div>
          </div>
        </header>

        {data.items.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">ยังไม่มีรายการสินค้าในลิสต์นี้</p>
        ) : (
          <section aria-label="Wish list items" className="space-y-8 sm:space-y-6">
            {data.items.map((row) => {
              const variantLabel =
                row.variant_id != null
                  ? row.product.variants?.find((v) => v.id === row.variant_id)?.label
                  : undefined;
              return (
                <div key={row.id} className="space-y-3 sm:space-y-2">
                  <div className="flex flex-col gap-2 text-sm text-stone-700 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-2 dark:text-stone-300">
                    <span className="font-semibold tabular-nums">ขอ {row.quantity_requested} ชิ้น</span>
                    {variantLabel ? (
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-800 dark:bg-zinc-800 dark:text-stone-200">
                        {variantLabel}
                      </span>
                    ) : null}
                    {row.note ? (
                      <span className="text-stone-600 dark:text-stone-400">— {row.note}</span>
                    ) : null}
                  </div>
                  <ProductCard p={row.product} />
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
