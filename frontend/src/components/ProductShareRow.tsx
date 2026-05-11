"use client";

import { useState, useSyncExternalStore } from "react";

type Props = {
  url: string;
  title: string;
};

function subscribeToNothing() {
  return () => {};
}

function getServerCanNativeShare() {
  return false;
}

function getClientCanNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function ProductShareRow({ url, title }: Props) {
  const [copied, setCopied] = useState(false);
  const canNativeShare = useSyncExternalStore(
    subscribeToNothing,
    getClientCanNativeShare,
    getServerCanNativeShare,
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function nativeShare() {
    if (!canNativeShare) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title, text: title, url });
    } catch {
      /* user cancelled or share failed */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <span className="text-xs font-medium text-stone-500 dark:text-stone-400">Share</span>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
      {canNativeShare ? (
        <button
          type="button"
          onClick={() => void nativeShare()}
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-100 dark:hover:bg-teal-900/50"
        >
          Share…
        </button>
      ) : null}
    </div>
  );
}
