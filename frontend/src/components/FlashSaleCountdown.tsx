"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "สิ้นสุดโปรแล้ว";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} วัน ${h} ชม. ${m} นาที`;
  if (h > 0) return `${h} ชม. ${m} นาที ${sec} วิ`;
  return `${m} นาที ${sec} วิ`;
}

type Props = { endsAtIso: string; className?: string };

/** Shown when a flash deal is active (`compare_at_price` set). */
export function FlashSaleCountdown({ endsAtIso, className = "" }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const end = new Date(endsAtIso).getTime();
  const ms = end - now;

  return (
    <p
      className={`text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-400 ${className}`}
      suppressHydrationWarning
    >
      ⏳ Flash deal · เหลือเวลา {formatRemaining(ms)}
    </p>
  );
}
