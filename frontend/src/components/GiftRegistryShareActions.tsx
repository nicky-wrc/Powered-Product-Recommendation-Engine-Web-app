"use client";

import { useEffect, useState, startTransition } from "react";

type Props = {
  shareUrl: string;
};

/**
 * Copy / Web Share for public gift registry page (server passes absolute URL).
 */
export function GiftRegistryShareActions({ shareUrl }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setNativeShareAvailable(typeof navigator.share === "function");
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast("คัดลอกลิงก์แล้ว");
    } catch {
      setToast("คัดลอกไม่สำเร็จ — ลองเลือกข้อความด้านล่างแล้วคัดลอกเอง");
    }
  }

  async function onNativeShare() {
    if (typeof navigator === "undefined" || !navigator.share) {
      await onCopy();
      return;
    }
    try {
      await navigator.share({ title: "Gift list", url: shareUrl });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      await onCopy();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void onCopy()}
        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
      >
        คัดลอกลิงก์
      </button>
      {nativeShareAvailable ? (
        <button
          type="button"
          onClick={() => void onNativeShare()}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
        >
          แชร์…
        </button>
      ) : null}
      {toast ? (
        <span
          role="status"
          className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-950"
        >
          {toast}
        </span>
      ) : null}
    </div>
  );
}
