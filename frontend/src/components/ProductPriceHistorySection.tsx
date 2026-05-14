"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ProductPriceHistoryResponse } from "@/lib/api";

function formatShortDate(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ChartRow = { day: string; unit_price: number; label: string };

type Props = {
  history: ProductPriceHistoryResponse | null;
  currentPrice: number;
};

export function ProductPriceHistorySection({ history, currentPrice }: Props) {
  const rows: ChartRow[] = useMemo(() => {
    const pts = history?.points ?? [];
    return pts.map((p) => ({
      ...p,
      label: formatShortDate(p.day),
    }));
  }, [history]);

  const low = history?.period_low ?? null;
  const high = history?.period_high ?? null;
  const hasChart = rows.length > 0;

  return (
    <section
      id="price-history"
      className="space-y-4 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90"
      aria-labelledby="price-history-heading"
    >
      <div>
        <h2 id="price-history-heading" className="text-xl font-bold text-stone-900 dark:text-stone-50">
          Price history
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Daily storefront unit price (UTC calendar day). Period low and high are computed from the snapshots shown
          (default range: last 90 days).
        </p>
      </div>

      {hasChart && low != null && high != null ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <p className="rounded-xl border border-stone-200/80 bg-stone-50/80 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">
            <span className="font-semibold text-stone-800 dark:text-stone-200">Period low</span>{" "}
            <span className="tabular-nums text-teal-700 dark:text-teal-400">${low.toFixed(2)}</span>
          </p>
          <p className="rounded-xl border border-stone-200/80 bg-stone-50/80 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">
            <span className="font-semibold text-stone-800 dark:text-stone-200">Period high</span>{" "}
            <span className="tabular-nums text-stone-700 dark:text-stone-300">${high.toFixed(2)}</span>
          </p>
          <p className="rounded-xl border border-stone-200/80 bg-stone-50/80 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">
            <span className="font-semibold text-stone-800 dark:text-stone-200">Current</span>{" "}
            <span className="tabular-nums text-teal-700 dark:text-teal-400">${currentPrice.toFixed(2)}</span>
          </p>
        </div>
      ) : null}

      {!hasChart ? (
        <div className="rounded-2xl border border-dashed border-stone-300/90 bg-stone-50/50 px-4 py-6 text-center text-sm text-stone-600 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-stone-400">
          <p>
            No saved price history yet for this SKU. We record a data point when an admin creates or updates the
            product (including variant prices).
          </p>
          <p className="mt-2">
            Current price:{" "}
            <span className="font-semibold tabular-nums text-teal-700 dark:text-teal-400">
              ${currentPrice.toFixed(2)}
            </span>
          </p>
        </div>
      ) : (
        <div className="h-[240px] w-full min-w-0 min-h-[240px]">
          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-stone-200 dark:stroke-zinc-800" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="text-stone-500"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="text-stone-500"
                domain={["auto", "auto"]}
                tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                width={48}
              />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row?.day ?? "";
                }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--tw-prose-body, #e7e5e4)",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="unit_price"
                stroke="#0f766e"
                strokeWidth={2}
                dot={{ r: 3, fill: "#0f766e" }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
