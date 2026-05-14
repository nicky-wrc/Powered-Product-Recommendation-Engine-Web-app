"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatNetworkError, getToken, postBundleToCart } from "@/lib/api";

type Props = { bundleId: string; bundleName: string };

export function BundleAddToCart({ bundleId, bundleName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onAdd() {
    setErr(null);
    const t = getToken();
    if (!t) {
      router.push(`/login?returnTo=${encodeURIComponent(`/bundles/${bundleId}`)}`);
      return;
    }
    setBusy(true);
    try {
      await postBundleToCart(t, bundleId, 1);
      router.push("/cart");
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void onAdd()}
        disabled={busy}
        className="rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500"
      >
        {busy ? "Adding…" : `Add bundle: ${bundleName}`}
      </button>
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Adds all items in this bundle to your cart at the bundle price (sign in required).
      </p>
    </div>
  );
}
