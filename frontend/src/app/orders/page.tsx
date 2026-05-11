"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ReorderOrderButton } from "@/components/ReorderOrderButton";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchMyOrders, getToken, syncStripeCheckoutSession, type OrderPublic } from "@/lib/api";
import { CART_CHANGED_EVENT } from "@/lib/cart";

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderPublic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      queueMicrotask(() => {
        setOrders([]);
        setErr("Log in to see orders.");
      });
      return;
    }
    void (async () => {
      queueMicrotask(() => setErr(null));
      const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const sessionId = qs?.get("session_id");
      const payment = qs?.get("payment");
      if (payment === "stripe" && sessionId) {
        try {
          await syncStripeCheckoutSession(t, sessionId);
          window.dispatchEvent(new Event(CART_CHANGED_EVENT));
          window.history.replaceState({}, "", "/orders");
        } catch (e) {
          queueMicrotask(() =>
            setErr(e instanceof Error ? e.message : "Could not confirm Stripe payment."),
          );
        }
      }
      try {
        const o = await fetchMyOrders(t);
        queueMicrotask(() => setOrders(o));
      } catch (e) {
        queueMicrotask(() => setErr(e instanceof Error ? e.message : "Failed to load orders"));
      }
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">Orders</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Completed orders from demo checkout or Stripe (<code className="rounded bg-stone-100 px-1 text-xs dark:bg-zinc-900">payment_method</code> saved per order).
          </p>
        </div>

        {err ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {err}{" "}
            <Link href="/login?next=/orders" className="font-semibold text-teal-700 underline dark:text-teal-400">
              Log in
            </Link>
          </p>
        ) : null}

        {orders === null ? <p className="text-sm text-stone-500">Loading…</p> : null}

        {orders && orders.length === 0 && !err ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No orders yet.{" "}
            <Link href="/products" className="font-semibold text-teal-700 underline dark:text-teal-400">
              Shop
            </Link>
          </p>
        ) : null}

        {orders && orders.length > 0 ? (
          <ul className="space-y-4">
            {orders.map((o) => (
              <li
                key={o.id}
                className="rounded-2xl border border-stone-200/90 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {new Date(o.created_at).toLocaleString()} ·{" "}
                    <span className="font-medium text-teal-700 dark:text-teal-400">{o.status}</span>
                    {o.payment_method ? (
                      <>
                        {" · "}
                        <span className="text-stone-600 dark:text-stone-400">Pay: {o.payment_method}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
                    ${o.total_amount.toFixed(2)}
                  </p>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-stone-700 dark:text-stone-300">
                  {o.items.map((it) => (
                    <li key={`${o.id}-${it.product_id}`}>
                      {it.product_name} × {it.quantity} @ ${it.unit_price.toFixed(2)}
                    </li>
                  ))}
                </ul>
                {o.gift_wrap ? (
                  <p className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <span className="font-semibold">Gift wrapping</span>
                    {o.gift_message ? (
                      <>
                        <span className="block mt-1 text-emerald-900/90 dark:text-emerald-200/90">{o.gift_message}</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <ReorderOrderButton order={o} />
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
