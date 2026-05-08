"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { fetchMyOrders, getToken, type OrderPublic } from "@/lib/api";

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
    queueMicrotask(() => setErr(null));
    fetchMyOrders(t)
      .then((o) => queueMicrotask(() => setOrders(o)))
      .catch((e) =>
        queueMicrotask(() => setErr(e instanceof Error ? e.message : "Failed to load orders")),
      );
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Orders</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Placed orders (demo checkout).</p>
        </div>

        {err ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {err}{" "}
            <Link href="/login?next=/orders" className="font-medium underline">
              Log in
            </Link>
          </p>
        ) : null}

        {orders === null ? <p className="text-sm text-zinc-500">Loading…</p> : null}

        {orders && orders.length === 0 && !err ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No orders yet.{" "}
            <Link href="/products" className="underline">
              Shop
            </Link>
          </p>
        ) : null}

        {orders && orders.length > 0 ? (
          <ul className="space-y-4">
            {orders.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-zinc-500">
                    {new Date(o.created_at).toLocaleString()} · {o.status}
                  </p>
                  <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    ${o.total_amount.toFixed(2)}
                  </p>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {o.items.map((it) => (
                    <li key={`${o.id}-${it.product_id}`}>
                      {it.product_name} × {it.quantity} @ ${it.unit_price.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
