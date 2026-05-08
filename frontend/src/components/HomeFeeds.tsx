"use client";

import { useEffect, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import type { Product, RecommendationMeta } from "@/lib/api";
import { fetchPersonalized, getToken } from "@/lib/api";

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
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">For you</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Hybrid recommender: truncated SVD on interaction weights (collaborative) plus TF‑IDF on titles/tags
            (content). Cold users fall back to trending.
          </p>
          {loading ? <p className="text-sm text-zinc-500">Loading your feed…</p> : null}
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {meta && !loading && !error ? (
            <p className="text-xs text-zinc-500">
              Mode: <span className="font-medium">{meta.mode}</span>
              {meta.used_collaborative ? " · collaborative" : ""}
              {meta.used_content ? " · content" : ""}
              {meta.fallback_popular ? " · filled with trending" : ""}
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
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No picks yet — browse products and log views or purchases to build signals.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Trending now</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {initialPopular.map((p, i) => (
            <ProductCard key={p.id} p={p} priority={prioritizeTrending && i < 4} />
          ))}
        </div>
      </section>

      {!token ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <a href="/register" className="font-medium text-zinc-900 underline dark:text-zinc-100">
            Create an account
          </a>{" "}
          to unlock the personalized rail and click/view tracking.
        </p>
      ) : null}
    </>
  );
}
