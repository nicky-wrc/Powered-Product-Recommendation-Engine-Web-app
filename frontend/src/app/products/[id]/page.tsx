import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompareToggle } from "@/components/CompareToggle";
import { ProductActions } from "@/components/ProductActions";
import { ProductCard } from "@/components/ProductCard";
import { ProductExploreTrustSection } from "@/components/ProductExploreTrustSection";
import { ProductHighlightsSection } from "@/components/ProductHighlightsSection";
import { ProductFaqSection } from "@/components/ProductFaqSection";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import { FlashSaleCountdown } from "@/components/FlashSaleCountdown";
import { ProductMediaSpotlightSection } from "@/components/ProductMediaSpotlightSection";
import { ProductPageClosingSection } from "@/components/ProductPageClosingSection";
import { ProductQaSection } from "@/components/ProductQaSection";
import { ProductRecommendationGridSection } from "@/components/ProductRecommendationGridSection";
import { ProductRecentSection } from "@/components/ProductRecentSection";
import { ProductReviewsSection } from "@/components/ProductReviewsSection";
import { ProductServicePoliciesSection } from "@/components/ProductServicePoliciesSection";
import { ProductShareRow } from "@/components/ProductShareRow";
import { ProductSustainabilitySection } from "@/components/ProductSustainabilitySection";
import { StockAlertCTA } from "@/components/StockAlertCTA";
import { SiteHeader } from "@/components/SiteHeader";
import { SustainabilityBadge } from "@/components/SustainabilityBadge";
import { WishlistHeart } from "@/components/WishlistHeart";
import { TrackProductView } from "@/components/TrackProductView";
import { fetchProduct, productGalleryUrls } from "@/lib/api";
import { concurrentViewersIllustration } from "@/lib/socialProof";
import { absoluteUrl } from "@/lib/siteUrl";
import { getVideoEmbedInfo } from "@/lib/videoEmbed";
import { cache } from "react";

type Props = { params: Promise<{ id: string }> };

const getProductPageData = cache(fetchProduct);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getProductPageData(id);
  if (!data) return { title: "Product" };

  const p = data.product;
  const priceStr = `$${p.price.toFixed(2)}`;
  const rawDesc = p.description?.replace(/\s+/g, " ").trim() ?? "";
  const description =
    rawDesc.length > 0
      ? rawDesc.slice(0, 155) + (rawDesc.length > 155 ? "…" : "")
      : `${p.name} — ${priceStr}${p.category ? ` · ${p.category}` : ""}`;

  const resolvedGallery = productGalleryUrls(p);
  const images =
    resolvedGallery.length > 0
      ? resolvedGallery.map((url) => ({
          url,
          alt: p.name,
        }))
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
  const { product: p, similar_products, bought_together, review_summary, review_eligibility } = data;
  const shareUrl = absoluteUrl(`/products/${p.id}`);
  const resolvedImages = productGalleryUrls(p).map((u) => absoluteUrl(u));

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description ?? undefined,
    image: resolvedImages.length > 0 ? resolvedImages : undefined,
    offers: {
      "@type": "Offer",
      url: shareUrl,
      priceCurrency: "USD",
      price: p.price,
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
  if (review_summary.count > 0 && review_summary.average != null) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: review_summary.average,
      bestRating: 5,
      worstRating: 1,
      ratingCount: review_summary.count,
    };
  }
  const videoEmbed = p.video_url?.trim() ? getVideoEmbedInfo(p.video_url.trim()) : null;
  if (videoEmbed) {
    jsonLd.subjectOf = {
      "@type": "VideoObject",
      name: `${p.name} — product video`,
      description: p.description ?? undefined,
      embedUrl: videoEmbed.src,
    };
  }

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

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14 lg:items-start">
          <ProductImageGallery product={p} wishlistSlot={<WishlistHeart product={p} />} />
          <div className="flex flex-col gap-5">
            {p.category ? (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
                {p.category}
              </p>
            ) : null}
            <SustainabilityBadge product={p} />
            {p.is_gift_card ? (
              <p className="inline-flex w-fit items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-900 dark:border-violet-800/60 dark:bg-violet-950/50 dark:text-violet-200">
                Digital gift card — code delivered after purchase
              </p>
            ) : null}
            <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-50 md:text-4xl">
              {p.name}
            </h1>
            <div className="flex flex-wrap items-baseline gap-4">
              <div className="flex flex-col gap-1">
                {p.compare_at_price != null && p.compare_at_price > p.price ? (
                  <span className="text-lg text-stone-400 line-through tabular-nums dark:text-stone-500">
                    ${p.compare_at_price.toFixed(2)}
                  </span>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-3xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                    ${p.price.toFixed(2)}
                  </p>
                  {p.compare_at_price != null && p.compare_at_price > p.price ? (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold uppercase text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                      Flash deal
                    </span>
                  ) : null}
                </div>
                {p.compare_at_price != null && p.sale_ends_at ? (
                  <FlashSaleCountdown endsAtIso={p.sale_ends_at} className="!mt-1" />
                ) : null}
              </div>
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
            <StockAlertCTA product={p} />
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
                    {concurrentViewersIllustration(p.id)}
                  </span>{" "}
                  people are viewing this item right now.
                </p>
                <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-500">
                  Illustrative indicator — connect your analytics to drive this from live traffic.
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

        <ProductReviewsSection productId={p.id} initialSummary={review_summary} initialEligibility={review_eligibility} />

        <ProductQaSection productId={p.id} />

        <ProductHighlightsSection
          product={p}
          reviewCount={review_summary.count}
          reviewAverage={review_summary.average}
        />

        <ProductServicePoliciesSection product={p} />

        <ProductSustainabilitySection product={p} />

        <ProductRecentSection currentProductId={p.id} />

        <ProductFaqSection />

        <ProductMediaSpotlightSection productName={p.name} videoUrl={p.video_url} />

        <ProductExploreTrustSection category={p.category} />

        {bought_together.length > 0 ? (
          <ProductRecommendationGridSection
            title="มักซื้อคู่กัน"
            description="สินค้าที่ลูกค้ามักสั่งร่วมกับรายการนี้ — คำนวณจากออเดอร์ในระบบของเรา"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {bought_together.map((bp) => (
                <ProductCard key={bp.id} p={bp} />
              ))}
            </div>
          </ProductRecommendationGridSection>
        ) : null}

        <ProductRecommendationGridSection
          title="สินค้าที่คล้ายกัน"
          description="สินค้าในหมวดเดียวกันและเพื่อนบ้านในแคตตาล็อก — ช่วยเสริมการตัดสินใจ"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar_products.map((sp) => (
              <ProductCard key={sp.id} p={sp} />
            ))}
          </div>
        </ProductRecommendationGridSection>

        <ProductPageClosingSection category={p.category} />
      </main>
    </div>
  );
}
