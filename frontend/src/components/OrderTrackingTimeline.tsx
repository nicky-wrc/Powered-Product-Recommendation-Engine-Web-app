"use client";

import type { OrderPublic } from "@/lib/api";

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

export function OrderTrackingTimeline({ order }: { order: OrderPublic }) {
  const steps = order.tracking_steps ?? [];
  if (steps.length === 0) return null;

  const trackUrl =
    order.tracking_carrier && order.tracking_number
      ? `https://www.google.com/search?q=${encodeURIComponent(`${order.tracking_carrier} ${order.tracking_number}`)}`
      : null;

  return (
    <div className="mt-4 rounded-xl border border-stone-200/90 bg-stone-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400">Shipping progress</p>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s.done
                    ? "bg-emerald-500 text-white shadow-sm"
                    : s.current
                      ? "bg-amber-400 text-stone-900 ring-2 ring-amber-200 dark:bg-amber-500 dark:text-stone-950 dark:ring-amber-900/50"
                      : "border border-stone-300 bg-white text-stone-400 dark:border-zinc-600 dark:bg-zinc-950"
                }`}
                aria-hidden
              >
                {s.done ? "✓" : i + 1}
              </span>
              {i < steps.length - 1 ? (
                <span
                  className={`mt-1 w-px grow min-h-[12px] ${s.done ? "bg-emerald-300 dark:bg-emerald-800" : "bg-stone-200 dark:bg-zinc-700"}`}
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="min-w-0 pt-0.5">
              <p
                className={`text-sm font-semibold ${
                  s.current ? "text-amber-900 dark:text-amber-200" : "text-stone-800 dark:text-stone-200"
                }`}
              >
                {s.label}
              </p>
              {formatWhen(s.at) ? (
                <p className="mt-0.5 text-xs text-stone-500 tabular-nums dark:text-stone-400">{formatWhen(s.at)}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {order.tracking_carrier || order.tracking_number ? (
        <div className="mt-3 border-t border-stone-200/80 pt-3 text-sm dark:border-zinc-700">
          {order.tracking_carrier ? (
            <p className="text-stone-700 dark:text-stone-300">
              Carrier: <span className="font-medium text-stone-900 dark:text-stone-100">{order.tracking_carrier}</span>
            </p>
          ) : null}
          {order.tracking_number ? (
            <p className="mt-1 font-mono text-stone-800 dark:text-stone-200">
              Tracking #: {order.tracking_number}
            </p>
          ) : null}
          {trackUrl ? (
            <a
              href={trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-sm font-semibold text-teal-700 underline hover:text-teal-600 dark:text-teal-400"
            >
              Search tracking (opens new tab)
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
