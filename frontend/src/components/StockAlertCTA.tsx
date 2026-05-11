"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Product } from "@/lib/api";
import {
  isStockAlertSet,
  removeStockAlert,
  toggleStockAlert,
  STOCK_ALERTS_CHANGED_EVENT,
} from "@/lib/stockAlerts";
import { NOTIFICATION_PREFS_CHANGED_EVENT, wantsStockAlertEmails } from "@/lib/notificationPrefs";

type Props = { product: Product };

export function StockAlertCTA({ product }: Props) {
  const [watching, setWatching] = useState(false);
  const [restockBanner, setRestockBanner] = useState(false);
  const [prefsOk, setPrefsOk] = useState(true);

  useEffect(() => {
    const syncPrefs = () => setPrefsOk(wantsStockAlertEmails());
    syncPrefs();
    window.addEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, syncPrefs);
    return () => window.removeEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, syncPrefs);
  }, []);

  useEffect(() => {
    const sync = () => {
      const w = isStockAlertSet(product.id);
      setWatching(w);
      if (product.stock > 0 && w) {
        removeStockAlert(product.id);
        setWatching(false);
        setRestockBanner(true);
        window.setTimeout(() => setRestockBanner(false), 8000);
      }
    };
    sync();
    window.addEventListener(STOCK_ALERTS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(STOCK_ALERTS_CHANGED_EVENT, sync);
  }, [product.id, product.stock]);

  if (restockBanner) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        สินค้านี้กลับมามีสต็อกแล้ว — เรานำออกจากรายการแจ้งเตือนให้แล้ว
      </div>
    );
  }

  if (product.stock > 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-sm font-medium text-amber-950 dark:text-amber-100">สินค้าหมดชั่วคราว</p>
      {!prefsOk ? (
        <p className="text-xs text-amber-900/80 dark:text-amber-200/90">
          คุณปิดการแจ้งเตือนสต็อกใน{" "}
          <Link href="/settings/notifications" className="font-semibold underline">
            ตั้งค่าการแจ้งเตือน
          </Link>{" "}
          — ระบบยังเก็บรายการรอแจ้งในเครื่องนี้ได้ แต่เวอร์ชันเดโมยังไม่ส่งอีเมล
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          toggleStockAlert(product);
        }}
        className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          watching
            ? "border border-amber-400 bg-white text-amber-900 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-100"
            : "bg-amber-600 text-white hover:bg-amber-500 dark:bg-amber-700 dark:hover:bg-amber-600"
        }`}
      >
        {watching ? "✓ จะแจ้งเมื่อกลับมา — กดอีกครั้งเพื่อยกเลิก" : "แจ้งเตือนเมื่อสินค้ากลับมา"}
      </button>
      <p className="text-[11px] text-amber-900/70 dark:text-amber-200/70">
        เก็บรายการในเบราว์เซอร์ — เปิดหน้านี้อีกครั้งเมื่อมีสต็อกจะแสดงข้อความด้านบน
      </p>
    </div>
  );
}
