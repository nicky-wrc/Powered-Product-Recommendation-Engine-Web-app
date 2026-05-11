"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import {
  getNotificationPrefs,
  NOTIFICATION_PREFS_CHANGED_EVENT,
  setNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notificationPrefs";

const rows: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  {
    key: "email_order_updates",
    label: "อีเมลสถานะคำสั่งซื้อ",
    hint: "ยืนยันการสั่งซื้อ การจัดส่ง และการอัปเดตคำสั่งซื้อ",
  },
  {
    key: "email_promotions",
    label: "อีเมลโปรโมชันและข่าวสาร",
    hint: "ดีล ส่วนลด และแคมเปญจากร้าน (เดโม: เก็บความชอบในเครื่องเท่านั้น)",
  },
  {
    key: "email_stock_alerts",
    label: "แจ้งเตือนเมื่อสินค้ากลับมา",
    hint: "ควบคู่กับรายการรอแจ้งบนหน้าเว็บ — เดโมยังไม่ส่งอีเมลจริง (ดูหน้าแจ้งเตือนสต็อก)",
  },
  {
    key: "email_product_recommendations",
    label: "สินค้าแนะนำส่วนบุคคล",
    hint: "อีเมลแนะนำสินค้าตามความสนใจ (เดโม: ยังไม่ส่งอีเมลจริง)",
  },
];

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    const sync = () => queueMicrotask(() => setPrefs(getNotificationPrefs()));
    sync();
    window.addEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(NOTIFICATION_PREFS_CHANGED_EVENT, sync);
  }, []);

  function toggle(key: keyof NotificationPrefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setNotificationPrefs(next);
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">การแจ้งเตือน</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            เลือกประเภทการแจ้งเตือนที่ต้องการ (เวอร์ชันเดโมเก็บในเบราว์เซอร์ — ยังไม่ผูกกับอีเมลจริงบนเซิร์ฟเวอร์)
          </p>
        </div>

        <div className="space-y-0 divide-y divide-stone-200 rounded-3xl border border-stone-200/90 bg-white/90 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/90">
          {rows.map(({ key, label, hint }) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-4 p-5 transition hover:bg-stone-50/80 dark:hover:bg-zinc-900/50"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500 dark:border-zinc-600"
                checked={prefs ? prefs[key] : false}
                disabled={!prefs}
                onChange={() => toggle(key)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">{label}</span>
                <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-2xl border border-stone-200/90 bg-stone-50/80 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">รายการแจ้งเตือนสต็อก</h2>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
            จัดการสินค้าที่ “หมดชั่วคราว” ที่คุณกดติดตามไว้บน PDP
          </p>
          <Link
            href="/stock-alerts"
            className="mt-3 inline-flex text-sm font-semibold text-teal-700 hover:underline dark:text-teal-400"
          >
            ไปหน้ารายการแจ้งเตือนสต็อก →
          </Link>
        </div>

        <p className="text-center text-sm">
          <Link href="/profile" className="font-medium text-teal-700 underline dark:text-teal-400">
            กลับหน้าโปรไฟล์
          </Link>
        </p>
      </main>
    </div>
  );
}
