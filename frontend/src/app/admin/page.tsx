"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import type { AdminAnalytics } from "@/lib/api";
import { API_BASE, fetchAdminAnalytics, getToken } from "@/lib/api";

type Me = { email: string; is_admin: boolean };

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      queueMicrotask(() => {
        setMe(null);
        setLoading(false);
        setErr("Log in to view this page.");
      });
      return;
    }

    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Session invalid"))))
      .then((u: Me) => {
        setMe(u);
        if (!u.is_admin) {
          setErr("Admin only. Set is_admin=true for your user in the database.");
          setLoading(false);
          return;
        }
        return fetchAdminAnalytics(token)
          .then(setData)
          .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load analytics"));
      })
      .catch(() => setErr("Could not verify session."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Admin dashboard</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            CTR and event totals from the <code className="text-xs">interactions</code> table.
          </p>
        </div>

        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}

        {err ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {err}{" "}
            <Link href="/login" className="font-medium underline">
              Log in
            </Link>
          </div>
        ) : null}

        {data && me?.is_admin ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Metric title="Users" value={data.total_users} />
              <Metric title="Products" value={data.total_products} />
              <Metric title="CTR (clicks / views)" value={data.ctr} format="pct" />
              <Metric title="Views" value={data.total_views} />
              <Metric title="Clicks" value={data.total_clicks} />
              <Metric title="Purchase events" value={data.total_purchases} />
              <Metric title="Orders" value={data.total_orders} />
              <Metric title="Revenue" value={data.revenue} format="money" />
            </div>
            <p className="text-xs text-zinc-500">{data.note}</p>
            <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
              ← Back home
            </Link>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Metric({
  title,
  value,
  format,
}: {
  title: string;
  value: number;
  format?: "pct" | "money";
}) {
  const shown =
    format === "pct"
      ? `${(Number.isFinite(value) ? value * 100 : 0).toFixed(2)}%`
      : format === "money"
        ? `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`
        : String(value);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{shown}</p>
    </div>
  );
}
