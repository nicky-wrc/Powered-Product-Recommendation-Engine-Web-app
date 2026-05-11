"use client";

import { useEffect, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import type { Product, RecommendationMeta } from "@/lib/api";
import { fetchPersonalized, getToken } from "@/lib/api";

const sectionShell =
  "rounded-3xl border border-stone-200/80 bg-white/70 p-6 shadow-sm ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 dark:ring-white/[0.04] md:p-8";

export function HomeFeeds({ initialPopular }: { initialPopular: Product[] }) {
  const [personalized, setPersonalized] = useState<Product[] | null>(null);
  const [meta, setMeta] = useState<RecommendationMeta | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    queueMicrotask(() => setTokenState(t));
    if (!t) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetchPersonalized(t, 8, "hybrid")
      .then((feed) => {
        setPersonalized(feed.products);
        setMeta(feed.meta);
      })
      .catch(() => {
        setPersonalized([]);
        setMeta(null);
        setError("Could not load personalized feed. Is the API running?");
      })
      .finally(() => setLoading(false));
  }, []);

  const showPersonalizedItems = Boolean(
    token && personalized && personalized.length > 0 && !loading,
  );
  const prioritizeTrending = !showPersonalizedItems;

  return (
    <>
      {token ? (
        <section className={sectionShell}>
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">For you</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Hybrid feed: SVD on interactions + TF‑IDF on catalog text. New users get trending fill‑ins.
              </p>
            </div>
          </div>
          {loading ? <p className="text-sm text-stone-500">Loading your feed…</p> : null}
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {meta && !loading && !error ? (
            <p className="mb-4 text-xs text-stone-500">
              <span className="font-semibold text-teal-700 dark:text-teal-400">{meta.mode}</span>
              {meta.used_collaborative ? " · collaborative" : ""}
              {meta.used_content ? " · content" : ""}
              {meta.fallback_popular ? " · + trending" : ""}
            </p>
          ) : null}
          {personalized && personalized.length > 0 && !loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {personalized.map((p, i) => (
                <ProductCard key={p.id} p={p} priority={!loading && i < 4} />
              ))}
            </div>
          ) : null}
          {!loading && !error && personalized !== null && personalized.length === 0 ? (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              No picks yet — browse products so we can learn what you like.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className={sectionShell}>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">Trending now</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Top signals from the community.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {initialPopular.map((p, i) => (
            <ProductCard key={p.id} p={p} priority={prioritizeTrending && i < 4} />
          ))}
        </div>
        {!token ? (
          <p className="mt-6 text-sm text-stone-600 dark:text-stone-400">
            <a
              href="/register"
              className="font-semibold text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400"
            >
              Create an account
            </a>{" "}
            for personalized picks and full tracking.
          </p>
        ) : null}
      </section>
    </>
  );
}
