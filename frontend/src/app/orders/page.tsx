"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ReorderOrderButton } from "@/components/ReorderOrderButton";
import { OrderFulfillmentActions } from "@/components/OrderFulfillmentActions";
import { OrderTrackingTimeline } from "@/components/OrderTrackingTimeline";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchMyOrders, getToken, notifyProfileUpdated, syncStripeCheckoutSession, type OrderHistoryFilters, type OrderPublic } from "@/lib/api";
import { emitCartChanged } from "@/lib/cart";
import { formatOrderShippingLines, hasOrderShippingSnapshot } from "@/lib/orderShippingDisplay";
import { usePollWhileVisible } from "@/lib/usePollWhileVisible";

const DEFAULT_QUERY: OrderHistoryFilters = { limit: 100 };

function buildFilters(
  fStatus: string,
  fPayment: string,
  fQ: string,
  fFrom: string,
  fTo: string,
  fMin: string,
  fMax: string,
): OrderHistoryFilters {
  const filters: OrderHistoryFilters = { ...DEFAULT_QUERY };
  if (fStatus.trim()) filters.status = fStatus.trim();
  if (fPayment.trim()) filters.payment_method = fPayment.trim();
  if (fQ.trim()) filters.q = fQ.trim();
  if (fFrom.trim()) filters.from_date = fFrom.trim();
  if (fTo.trim()) filters.to_date = fTo.trim();
  if (fMin.trim()) {
    const v = Number.parseFloat(fMin);
    if (!Number.isNaN(v)) filters.min_total = v;
  }
  if (fMax.trim()) {
    const v = Number.parseFloat(fMax);
    if (!Number.isNaN(v)) filters.max_total = v;
  }
  return filters;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderPublic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  /** Must not read localStorage during render — SSR and first client paint stay in sync. */
  const [loggedIn, setLoggedIn] = useState(false);

  const [fStatus, setFStatus] = useState("");
  const [fPayment, setFPayment] = useState("");
  const [fQ, setFQ] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");

  const lastQueryRef = useRef<OrderHistoryFilters>(DEFAULT_QUERY);

  const fetchWithFilters = useCallback(async (token: string, filters: OrderHistoryFilters) => {
    lastQueryRef.current = filters;
    if (filters.min_total != null && filters.max_total != null && filters.min_total > filters.max_total) {
      setErr("Min total cannot be greater than max total.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchMyOrders(token, filters);
      setOrders(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = getToken();
    setLoggedIn(!!t);
    if (!t) {
      queueMicrotask(() => {
        setOrders([]);
        setErr("Log in to see orders.");
      });
      return;
    }
    void (async () => {
      const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const sessionId = qs?.get("session_id");
      const payment = qs?.get("payment");
      if (payment === "stripe" && sessionId) {
        try {
          await syncStripeCheckoutSession(t, sessionId);
          emitCartChanged();
          notifyProfileUpdated();
          window.history.replaceState({}, "", "/orders");
        } catch (e) {
          queueMicrotask(() =>
            setErr(e instanceof Error ? e.message : "Could not confirm Stripe payment."),
          );
        }
      }
      setSessionReady(true);
    })();
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t || !sessionReady) return;
    void fetchWithFilters(t, lastQueryRef.current);
  }, [sessionReady, fetchWithFilters]);

  usePollWhileVisible(
    () => {
      const t = getToken();
      if (!t || !sessionReady) return;
      void fetchWithFilters(t, lastQueryRef.current);
    },
    18_000,
    loggedIn && sessionReady,
  );

  function applyFilters() {
    const t = getToken();
    if (!t) return;
    void fetchWithFilters(t, buildFilters(fStatus, fPayment, fQ, fFrom, fTo, fMin, fMax));
  }

  function resetFilters() {
    setFStatus("");
    setFPayment("");
    setFQ("");
    setFFrom("");
    setFTo("");
    setFMin("");
    setFMax("");
    const t = getToken();
    if (t) void fetchWithFilters(t, DEFAULT_QUERY);
  }

  const filtersActive =
    !!fStatus.trim() ||
    !!fPayment.trim() ||
    !!fQ.trim() ||
    !!fFrom.trim() ||
    !!fTo.trim() ||
    !!fMin.trim() ||
    !!fMax.trim();

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">Orders</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Order history with filters (status, payment method, product name search, date range, total range). New checkouts are
            <span className="font-medium text-stone-800 dark:text-stone-200"> processing</span> until fulfilled; download a PDF invoice or cancel while still processing.
          </p>
        </div>

        {loggedIn ? (
          <div className="rounded-2xl border border-stone-200/90 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-50">Filters</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-1">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Status (exact)</span>
                <input
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value)}
                  placeholder="e.g. processing, completed"
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Payment contains</span>
                <input
                  value={fPayment}
                  onChange={(e) => setFPayment(e.target.value)}
                  placeholder="direct, stripe…"
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Product name contains</span>
                <input
                  value={fQ}
                  onChange={(e) => setFQ(e.target.value)}
                  placeholder="Search line items"
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">From (UTC date)</span>
                <input
                  type="date"
                  value={fFrom}
                  onChange={(e) => setFFrom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">To (UTC date)</span>
                <input
                  type="date"
                  value={fTo}
                  onChange={(e) => setFTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Min total ($)</span>
                <input
                  inputMode="decimal"
                  value={fMin}
                  onChange={(e) => setFMin(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Max total ($)</span>
                <input
                  inputMode="decimal"
                  value={fMax}
                  onChange={(e) => setFMax(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={applyFilters}
                className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-teal-600/25 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Apply filters"}
              </button>
              <button
                type="button"
                disabled={loading || !filtersActive}
                onClick={resetFilters}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
              >
                Reset
              </button>
            </div>
          </div>
        ) : null}

        {err ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {err}{" "}
            <Link href="/login?next=/orders" className="font-semibold text-teal-700 underline dark:text-teal-400">
              Log in
            </Link>
          </p>
        ) : null}

        {orders === null && !err && loggedIn && sessionReady ? <p className="text-sm text-stone-500">Loading…</p> : null}

        {orders && orders.length === 0 && !err ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {filtersActive ? "No orders match these filters." : "No orders yet."}{" "}
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
                    <li key={`${o.id}-${it.product_id}-${it.variant_id ?? ""}`}>
                      <div>
                        {it.product_name} × {it.quantity} @ ${it.unit_price.toFixed(2)}
                      </div>
                      {it.installation_service_label ? (
                        <div className="ml-2 mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                          · {it.installation_service_label}
                          {it.installation_service_fee != null
                            ? ` (+$${it.installation_service_fee.toFixed(2)}/unit included in line price)`
                            : null}
                          {it.installation_slot_note ? ` — ${it.installation_slot_note}` : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {hasOrderShippingSnapshot(o) ? (
                  <div className="mt-4 rounded-lg border border-stone-200/90 bg-stone-50/80 px-3 py-2.5 text-xs text-stone-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-stone-200">
                    <p className="font-semibold text-stone-700 dark:text-stone-300">ที่อยู่จัดส่ง (ตามตอนสั่งซื้อ)</p>
                    <p className="mt-1.5 whitespace-pre-line leading-relaxed">{formatOrderShippingLines(o).join("\n")}</p>
                  </div>
                ) : null}
                <OrderTrackingTimeline order={o} />
                {o.promo_code && (o.promo_discount ?? 0) > 0 ? (
                  <p className="mt-3 text-sm text-teal-800 dark:text-teal-200">
                    Promo <span className="font-mono font-semibold">{o.promo_code}</span>
                    {" — "}
                    −${Number(o.promo_discount).toFixed(2)}
                  </p>
                ) : null}
                {(o.loyalty_points_redeemed ?? 0) > 0 && (o.loyalty_discount ?? 0) > 0 ? (
                  <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                    Loyalty −{o.loyalty_points_redeemed} pts · −${Number(o.loyalty_discount).toFixed(2)}
                  </p>
                ) : null}
                {o.gift_card_code && (o.gift_card_discount ?? 0) > 0 ? (
                  <p className="mt-1 text-sm text-violet-900 dark:text-violet-200">
                    Gift card <span className="font-mono font-semibold">{o.gift_card_code}</span>
                    {" — "}
                    −${Number(o.gift_card_discount).toFixed(2)}
                  </p>
                ) : null}
                {(o.loyalty_points_earned ?? 0) > 0 ? (
                  <p className="mt-0.5 text-xs text-stone-600 dark:text-stone-400">
                    +{o.loyalty_points_earned} loyalty points earned on this order
                  </p>
                ) : null}
                {o.gift_wrap ? (
                  <p className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <span className="font-semibold">Gift wrapping</span>
                    {o.gift_message ? (
                      <>
                        <span className="mt-1 block text-emerald-900/90 dark:text-emerald-200/90">{o.gift_message}</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <OrderFulfillmentActions
                  order={o}
                  onOrderUpdated={(updated) =>
                    setOrders((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev))
                  }
                />
                <ReorderOrderButton order={o} />
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
