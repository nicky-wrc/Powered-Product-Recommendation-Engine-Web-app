"use client";

import Link from "next/link";

import { freeShippingProgress } from "@/lib/freeShipping";

type Props = {
  subtotal: number;
};

/** Amazon-style cart nudge: progress toward free shipping on qualified subtotal. */
export function FreeShippingProgress({ subtotal }: Props) {
  if (subtotal <= 0) return null;

  const { qualified, remaining, percent, threshold } = freeShippingProgress(subtotal);

  return (
    <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/90 to-emerald-50/80 p-4 shadow-sm dark:border-teal-900/50 dark:from-teal-950/40 dark:to-emerald-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-teal-900 dark:text-teal-100">
          {qualified ? (
            <>
              <span className="text-emerald-700 dark:text-emerald-400">คุณถึงยอดฟรีค่าส่งแล้ว</span>
              <span className="font-normal text-teal-800/90 dark:text-teal-200/90">
                {" "}
                (สำหรับคำสั่งซื้อจาก <span className="tabular-nums">${threshold.toFixed(2)}</span> ขึ้นไปในเดโมนี้)
              </span>
            </>
          ) : (
            <>
              เพิ่มอีก{" "}
              <span className="tabular-nums font-semibold text-teal-800 dark:text-teal-200">
                ${remaining.toFixed(2)}
              </span>{" "}
              เพื่อครบยอดฟรีค่าส่ง
            </>
          )}
        </p>
        {!qualified ? (
          <Link
            href="/products"
            className="shrink-0 text-xs font-semibold text-teal-800 underline decoration-teal-600/40 underline-offset-2 hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-200"
          >
            เลือกซื้อต่อ
          </Link>
        ) : null}
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-teal-200/60 dark:bg-teal-900/50"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="ความคืบหน้าถึงยอดฟรีค่าส่ง"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-[width] duration-300 ease-out dark:from-teal-400 dark:to-emerald-400"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-teal-800/80 dark:text-teal-300/80">
        {qualified
          ? "ในสตอร์เดโมนี้เป็นข้อความจำลอง — ยังไม่ได้คิดค่าส่งจริงจาก carrier"
          : `ยอดขั้นต่ำเดโม: $${threshold.toFixed(2)} · ปรับได้ที่ NEXT_PUBLIC_FREE_SHIPPING_MIN_SUBTOTAL`}
      </p>
    </div>
  );
}
