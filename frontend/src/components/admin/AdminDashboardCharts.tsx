"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AdminAnalytics } from "@/lib/api";

const PIE_COLORS = ["#0d9488", "#2dd4bf", "#5eead4"];
const BAR_GRADIENT_ID = "adminBarGradient";

function fmtInt(n: number) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("th-TH") : "0";
}

function DashboardTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  const show = typeof v === "number" ? fmtInt(v) : String(v ?? "");
  return (
    <div className="rounded-xl border border-stone-200/90 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-900/95">
      <p className="font-semibold text-stone-800 dark:text-stone-100">{label ?? payload[0]?.name}</p>
      <p className="tabular-nums text-teal-700 dark:text-teal-300">{show}</p>
    </div>
  );
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name?: string; value?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const name = p?.name ?? p?.payload?.name;
  const v = p?.value ?? p?.payload?.value;
  return (
    <div className="rounded-xl border border-stone-200/90 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-900/95">
      <p className="font-semibold text-stone-800 dark:text-stone-100">{name}</p>
      <p className="tabular-nums text-teal-700 dark:text-teal-300">{typeof v === "number" ? fmtInt(v) : v}</p>
    </div>
  );
}

export function AdminDashboardCharts({ data }: { data: AdminAnalytics }) {
  const platformData = useMemo(
    () => [
      { name: "ผู้ใช้", value: data.total_users },
      { name: "สินค้า", value: data.total_products },
      { name: "คำสั่งซื้อ", value: data.total_orders },
    ],
    [data],
  );

  const eventData = useMemo(
    () => [
      { name: "ดูสินค้า", value: data.total_views },
      { name: "คลิก", value: data.total_clicks },
      { name: "ซื้อ (event)", value: data.total_purchases },
    ],
    [data],
  );

  const funnelData = useMemo(
    () => [
      { stage: "ดูสินค้า", value: data.total_views },
      { stage: "คลิก", value: data.total_clicks },
      { stage: "ซื้อ", value: data.total_purchases },
    ],
    [data],
  );

  const axisTick = { fill: "currentColor", fontSize: 11 };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-stone-200/90 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:p-6">
          <h3 className="text-base font-bold text-stone-900 dark:text-stone-50">ผู้ใช้ · สินค้า · คำสั่งซื้อ</h3>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">จำนวนรวมในระบบ (เปรียบเทียบเชิงปริมาณ)</p>
          <div className="mt-4 h-[280px] w-full text-stone-500 dark:text-zinc-400">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformData} margin={{ top: 6, right: 8, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id={BAR_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="currentColor" opacity={0.12} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={{ stroke: "currentColor", opacity: 0.2 }} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                <Tooltip content={<DashboardTooltip />} cursor={{ fill: "currentColor", opacity: 0.05 }} />
                <Bar dataKey="value" name="จำนวน" radius={[6, 6, 0, 0]} fill={`url(#${BAR_GRADIENT_ID})`} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200/90 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:p-6">
          <h3 className="text-base font-bold text-stone-900 dark:text-stone-50">สัดส่วนอีเวนต์</h3>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">ดู / คลิก / ซื้อ (จากตาราง interactions)</p>
          <div className="mt-2 h-[280px] w-full text-stone-500 dark:text-zinc-400">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={eventData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="none"
                  label={({ name, percent }) =>
                    `${name} ${percent != null ? (percent * 100).toFixed(0) : 0}%`
                  }
                  labelLine={{ stroke: "currentColor", strokeOpacity: 0.35 }}
                >
                  {eventData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  formatter={(value) => <span className="text-xs text-stone-600 dark:text-stone-300">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-stone-200/90 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:p-6">
        <h3 className="text-base font-bold text-stone-900 dark:text-stone-50">แนวโน้มการมีส่วนร่วม (ลำดับเหตุการณ์)</h3>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          เชื่อมจาก ดู → คลิก → ซื้อ — ไม่ใช่แกนเวลา แต่ช่วยมองภาพกระแสลดลงตามขั้นตอน
        </p>
        <div className="mt-4 h-[240px] w-full text-stone-500 dark:text-zinc-400">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={funnelData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="adminAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="currentColor" opacity={0.12} vertical={false} />
              <XAxis dataKey="stage" tick={axisTick} axisLine={{ stroke: "currentColor", opacity: 0.2 }} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
              <Tooltip content={<DashboardTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                name="จำนวน"
                stroke="#0d9488"
                strokeWidth={2.5}
                fill="url(#adminAreaGradient)"
                dot={{ r: 4, fill: "#0f766e", strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
