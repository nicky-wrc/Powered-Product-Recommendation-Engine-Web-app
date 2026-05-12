"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { AdminAnalytics, Readiness } from "@/lib/api";
import { fetchAdminAnalytics, fetchReadiness, getToken } from "@/lib/api";

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [ready, setReady] = useState<Readiness | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getToken();
    if (!auth) {
      setLoading(false);
      return;
    }
    fetchAdminAnalytics(auth)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดสถิติไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    fetchReadiness()
      .then((r) => {
        if (!cancelled) setReady(r);
      })
      .catch(() => {
        if (!cancelled) setReady(null);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const chartRows = useMemo(() => {
    if (!data) return [];
    return [
      { label: "ดูสินค้า", value: data.total_views },
      { label: "คลิก", value: data.total_clicks },
      { label: "ซื้อ (event)", value: data.total_purchases },
    ];
  }, [data]);

  const chartMax = useMemo(() => Math.max(...chartRows.map((r) => r.value), 1), [chartRows]);

  return (
    <>
      <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          ภาพรวมจากตาราง{" "}
          <code className="rounded bg-stone-100 px-1 text-xs dark:bg-zinc-900">interactions</code> และ{" "}
          <code className="rounded bg-stone-100 px-1 text-xs dark:bg-zinc-900">orders</code>
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/admin/catalog" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            เพิ่มสินค้าใหม่ →
          </Link>
          <Link href="/admin/inventory" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            สต็อกสินค้า →
          </Link>
        </p>
      </div>

      {loading ? <p className="text-sm text-stone-500">กำลังโหลดสถิติ…</p> : null}
      {err ? (
        <div className="rounded-2xl border border-rose-200/90 bg-rose-50/90 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric title="ผู้ใช้" value={data.total_users} />
            <Metric title="สินค้า" value={data.total_products} />
            <Metric title="คำสั่งซื้อ" value={data.total_orders} />
            <Metric title="รายได้" value={data.revenue} format="money" />
            <Metric title="CTR" value={data.ctr} format="pct" />
          </div>

          {ready ? (
            <div className="rounded-3xl border border-stone-200/90 bg-gradient-to-br from-teal-50/80 to-white/90 p-6 shadow-sm dark:border-zinc-800 dark:from-teal-950/40 dark:to-zinc-950/80 md:p-7">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">สถานะระบบ</h2>
              <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                Readiness · เวอร์ชัน API <span className="font-mono">{ready.version}</span>
              </p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl bg-white/80 px-4 py-3 dark:bg-zinc-900/80">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">ฐานข้อมูล</dt>
                  <dd className="mt-1 font-semibold capitalize text-teal-800 dark:text-teal-300">{ready.checks.database}</dd>
                </div>
                <div className="rounded-xl bg-white/80 px-4 py-3 dark:bg-zinc-900/80">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">แคช Redis</dt>
                  <dd className="mt-1 font-semibold capitalize text-teal-800 dark:text-teal-300">{ready.checks.redis}</dd>
                </div>
                <div className="rounded-xl bg-white/80 px-4 py-3 dark:bg-zinc-900/80">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">รวม</dt>
                  <dd className="mt-1 font-semibold capitalize text-emerald-800 dark:text-emerald-300">{ready.status}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                ตั้งค่า <code className="rounded bg-stone-100 px-1 dark:bg-zinc-800">REDIS_URL</code> เพื่อเปิดแคชรายการแนะนำ
                (popular / แนะนำส่วนตัว) — ดู <code className="rounded bg-stone-100 px-1 dark:bg-zinc-800">docker-compose.yml</code>{" "}
                service <code className="rounded bg-stone-100 px-1 dark:bg-zinc-800">redis</code>
              </p>
            </div>
          ) : null}

          <div className="rounded-3xl border border-stone-200/90 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:p-8">
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">ปริมาณอีเวนต์</h2>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">สัดส่วนเทียบค่าสูงสุดในมุมมองนี้ (100%)</p>
            <div className="mt-6 space-y-4">
              {chartRows.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-xs font-medium text-stone-600 dark:text-stone-400">
                    <span>{row.label}</span>
                    <span className="tabular-nums">{row.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-stone-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (row.value / chartMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-stone-500 dark:text-stone-400">{data.note}</p>
        </>
      ) : null}
    </>
  );
}

function Metric({
  title,
  value,
  format,
}: {
  title: string;
  value: number;
  format?: "pct" | "money";
}) {
  const shown =
    format === "pct"
      ? `${(Number.isFinite(value) ? value * 100 : 0).toFixed(2)}%`
      : format === "money"
        ? `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`
        : String(value);
  return (
    <div className="rounded-2xl border border-stone-200/90 bg-white/80 p-4 shadow-sm ring-1 ring-stone-900/[0.03] dark:border-zinc-800 dark:bg-zinc-950/80">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{shown}</p>
    </div>
  );
}
