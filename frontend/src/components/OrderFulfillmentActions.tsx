"use client";

import { useState } from "react";

import { useAppModal } from "@/components/AppModalProvider";
import { cancelOrder, downloadOrderInvoice, getToken, notifyProfileUpdated, type OrderPublic } from "@/lib/api";

type Props = {
  order: OrderPublic;
  onOrderUpdated: (o: OrderPublic) => void;
};

export function OrderFulfillmentActions({ order, onOrderUpdated }: Props) {
  const { confirm } = useAppModal();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canInvoice = order.status !== "cancelled";
  const canCancel = order.status === "processing";

  async function onInvoice() {
    const t = getToken();
    if (!t) return;
    setBusy(true);
    setMsg(null);
    try {
      await downloadOrderInvoice(t, order.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not download invoice");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    const t = getToken();
    if (!t) return;
    const ok = await confirm({
      title: "Cancel order",
      message:
        "Stock and loyalty / gift card / promo will be restored. Issued gift cards from this order will be deactivated. Continue?",
      confirmLabel: "Cancel order",
      cancelLabel: "Keep order",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const updated = await cancelOrder(t, order.id);
      onOrderUpdated(updated);
      notifyProfileUpdated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not cancel order");
    } finally {
      setBusy(false);
    }
  }

  if (!canInvoice && !canCancel) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canInvoice ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onInvoice()}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
          >
            {busy ? "…" : "Download invoice (PDF)"}
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCancel()}
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/60"
          >
            Cancel order
          </button>
        ) : null}
      </div>
      {msg ? <p className="text-xs text-red-600 dark:text-red-400">{msg}</p> : null}
    </div>
  );
}
