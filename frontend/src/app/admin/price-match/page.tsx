"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, startTransition } from "react";

import {
  adminListPriceMatchReports,
  adminPatchPriceMatchReport,
  formatNetworkError,
  getToken,
  type PriceMatchReportAdminRow,
} from "@/lib/api";

const STATUSES = ["pending", "approved", "rejected", "adjusted"] as const;

export default function AdminPriceMatchPage() {
  const [reports, setReports] = useState<PriceMatchReportAdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setErr("ไม่พบเซสชัน");
      setReports([]);
      setTotal(0);
      return;
    }
    setErr(null);
    try {
      const r = await adminListPriceMatchReports(t, {
        status: statusFilter || undefined,
        limit: 100,
      });
      setReports(r.reports);
      setTotal(r.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : formatNetworkError(e));
      setReports([]);
      setTotal(0);
    }
  }, [statusFilter]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  async function patchStatus(row: PriceMatchReportAdminRow, status: string) {
    const t = getToken();
    if (!t) return;
    setBusyId(row.id);
    setErr(null);
    try {
      const updated = await adminPatchPriceMatchReport(t, row.id, { status, admin_note: row.admin_note });
      setReports((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : formatNetworkError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200/90 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/80">
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-50">รายงานราคา (price match)</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          คิวจากลูกค้าบน PDP — อัปเดตสถานะเพื่อใช้ภายในร้าน (ยังไม่ปรับราคาอัตโนมัติ)
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-stone-600 dark:text-stone-400">
            สถานะ
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ml-2 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">ทั้งหมด</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-stone-500">
            ทั้งหมด <span className="tabular-nums font-semibold">{total}</span> รายการ
          </span>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      {reports.length === 0 ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">ไม่มีรายการในตัวกรองนี้</p>
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-stone-200/90 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                    {r.product_name ?? "สินค้า"}{" "}
                    <Link
                      href={`/products/${r.product_id}`}
                      className="ml-1 font-normal text-teal-700 underline dark:text-teal-400"
                    >
                      เปิด PDP
                    </Link>
                  </p>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    รายงาน <span className="tabular-nums">${r.reported_price.toFixed(2)}</span>
                    {r.storefront_unit_at_submit != null ? (
                      <>
                        {" "}
                        · ราคาเว็บเราตอนส่ง (~
                        <span className="tabular-nums">${r.storefront_unit_at_submit.toFixed(2)}</span>)
                      </>
                    ) : null}
                  </p>
                  {r.competitor_url ? (
                    <p className="mt-1 break-all text-xs text-teal-800 dark:text-teal-300">
                      <a href={r.competitor_url} target="_blank" rel="noreferrer" className="underline">
                        {r.competitor_url}
                      </a>
                    </p>
                  ) : null}
                  {r.notes ? <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">{r.notes}</p> : null}
                  <p className="mt-1 text-[11px] text-stone-500">
                    {r.reporter_email ?? "—"} · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium capitalize text-stone-800 dark:bg-zinc-800 dark:text-stone-200">
                    {r.status}
                  </span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {STATUSES.filter((s) => s !== r.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void patchStatus(r, s)}
                        className="rounded border border-stone-200 px-2 py-1 text-[11px] font-medium capitalize text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-zinc-600 dark:text-stone-200 dark:hover:bg-zinc-800"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
