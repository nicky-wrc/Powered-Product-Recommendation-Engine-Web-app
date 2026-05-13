"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductCard } from "@/components/ProductCard";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchMyGiftCards, fetchProducts, getToken, type GiftCardMine, type Product } from "@/lib/api";

export default function GiftCardsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [mine, setMine] = useState<GiftCardMine[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setErr(null);
      try {
        const { products: list } = await fetchProducts({ category: "gift-cards", limit: 48 });
        if (!cancelled) setProducts(list);
      } catch {
        if (!cancelled) {
          setErr("Could not load gift card products.");
          setProducts([]);
        }
      }
      const t = getToken();
      if (t) {
        try {
          const cards = await fetchMyGiftCards(t);
          if (!cancelled) setMine(cards);
        } catch {
          if (!cancelled) setMine([]);
        }
      } else if (!cancelled) {
        setMine(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">Gift cards</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
            Buy a balance-loaded digital code. After checkout, codes appear under your account and can be emailed to
            someone else. Redeem codes in the cart — they apply after coupons and loyalty.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/cart" className="font-semibold text-teal-700 underline dark:text-teal-400">
              Open cart to redeem a code
            </Link>
          </p>
        </div>

        {err ? <p className="text-sm text-amber-800 dark:text-amber-200">{err}</p> : null}

        {mine && mine.length > 0 ? (
          <section className="rounded-2xl border border-violet-200/80 bg-violet-50/40 p-5 dark:border-violet-900/40 dark:bg-violet-950/20">
            <h2 className="text-sm font-semibold text-violet-950 dark:text-violet-100">Your codes</h2>
            <ul className="mt-3 space-y-2 text-sm text-stone-800 dark:text-stone-200">
              {mine.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-violet-200/60 bg-white/80 px-3 py-2 dark:border-violet-800/50 dark:bg-zinc-950/60"
                >
                  <span className="font-mono font-semibold tracking-tight text-violet-900 dark:text-violet-200">
                    {c.code}
                  </span>
                  <span className="tabular-nums text-stone-600 dark:text-stone-400">
                    ${c.balance_remaining.toFixed(2)} left · face ${c.face_value.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {products === null ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No gift card products yet.{" "}
            <Link href="/products" className="font-semibold text-teal-700 underline dark:text-teal-400">
              Browse catalog
            </Link>
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p, i) => (
              <li key={p.id}>
                <ProductCard p={p} priority={i < 6} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
