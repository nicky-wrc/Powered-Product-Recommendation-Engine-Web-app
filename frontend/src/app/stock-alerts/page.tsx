"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { useAppModal } from "@/components/AppModalProvider";
import {
  clearStockAlerts,
  getStockAlerts,
  removeStockAlert,
  STOCK_ALERTS_CHANGED_EVENT,
  type StockAlertEntry,
} from "@/lib/stockAlerts";

export default function StockAlertsPage() {
  const [items, setItems] = useState<StockAlertEntry[]>([]);
  const { confirm } = useAppModal();

  useEffect(() => {
    const sync = () => queueMicrotask(() => setItems(getStockAlerts()));
    sync();
    window.addEventListener(STOCK_ALERTS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(STOCK_ALERTS_CHANGED_EVENT, sync);
  }, []);

  async function removeOne(productId: string, name: string) {
    const ok = await confirm({
      title: "ลบการแจ้งเตือน",
      message: `หยุดแจ้งเตือนสต็อกสำหรับ "${name}"?`,
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    removeStockAlert(productId);
  }

  async function clearAll() {
    const ok = await confirm({
      title: "ล้างทั้งหมด",
      message: "ลบรายการแจ้งเตือนสต็อกทั้งหมดในรายการนี้?",
      confirmLabel: "ล้างทั้งหมด",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    clearStockAlerts();
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-xl space-y-8 px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">แจ้งเตือนสต็อก</h1>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              รายการสินค้าที่รอให้กลับมามีสต็อก — เปิดหน้ารายละเอียดสินค้าอีกครั้งเมื่อมีสต็อก ระบบจะแจ้งบนหน้านั้น (ยังไม่ส่งอีเมลอัตโนมัติ)
            </p>
          </div>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => void clearAll()}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
            >
              ล้างทั้งหมด
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-6 py-12 text-center text-stone-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-stone-400">
            ยังไม่มีรายการ — เลือกสินค้าที่หมดแล้วกด「แจ้งเตือนเมื่อสินค้ากลับมา」บนหน้ารายละเอียด
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((x) => (
              <li
                key={x.product_id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200/90 bg-white/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/90"
              >
                <Link
                  href={`/products/${x.product_id}`}
                  className="min-w-0 flex-1 font-medium text-teal-700 hover:underline dark:text-teal-400"
                >
                  {x.name}
                </Link>
                <button
                  type="button"
                  onClick={() => void removeOne(x.product_id, x.name)}
                  className="shrink-0 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-center text-sm">
          <Link href="/products" className="font-medium text-teal-700 underline dark:text-teal-400">
            ไปแคตตาล็อก
          </Link>
          <span className="text-stone-400 dark:text-stone-600"> · </span>
          <Link href="/settings/notifications" className="font-medium text-teal-700 underline dark:text-teal-400">
            ตั้งค่าการแจ้งเตือน
          </Link>
        </p>
      </main>
    </div>
  );
}
