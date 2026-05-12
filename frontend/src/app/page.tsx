import Link from "next/link";

import { HomeFeeds } from "@/components/HomeFeeds";
import { RecentStrip } from "@/components/RecentStrip";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchPopular } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  const popular = await fetchPopular(8);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-14 px-4 py-10 md:py-14">
        <div className="relative overflow-hidden rounded-3xl border border-stone-200/80 bg-white/60 p-8 shadow-lg shadow-stone-900/5 ring-1 ring-stone-900/[0.04] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/60 dark:shadow-black/40 md:p-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl dark:bg-teal-500/10" />
          <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-600/10" />
          <div className="relative max-w-2xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
              NickyShopEngine
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-50 md:text-4xl md:leading-tight">
              Discover products picked for{" "}
              <span className="bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent dark:from-teal-400 dark:to-emerald-400">
                your taste
              </span>
            </h1>
            <p className="text-base leading-relaxed text-stone-600 dark:text-stone-400">
              Sign in for hybrid recommendations (collaborative + content-based), or browse trending picks below.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/products"
                className="inline-flex items-center rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 transition hover:from-teal-500 hover:to-emerald-500"
              >
                Browse catalog
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center rounded-xl border border-stone-300 bg-white/80 px-5 py-2.5 text-sm font-semibold text-stone-800 backdrop-blur-sm transition hover:bg-white dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-stone-100 dark:hover:bg-zinc-900"
              >
                Create account
              </Link>
            </div>
          </div>
        </div>

        <RecentStrip />
        <HomeFeeds initialPopular={popular} />
      </main>
    </div>
  );
}
