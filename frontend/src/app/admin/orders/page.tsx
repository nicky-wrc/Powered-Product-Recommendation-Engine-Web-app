"use client";

import { useCallback, useEffect, useState } from "react";

import {
  adminListOrders,
  adminPatchOrderShipment,
  getToken,
  formatNetworkError,
  type OrderPublic,
} from "@/lib/api";

export default function AdminOrdersPage() {
  const [rows, setRows] = useState<OrderPublic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [carrierEdits, setCarrierEdits] = useState<Record<string, string>>({});
  const [numberEdits, setNumberEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setErr("ไม่พบเซสชัน");
      setRows([]);
      return;
    }
    setErr(null);
    try {
      const list = await adminListOrders(t, { limit: 80 });
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : formatNetworkError(e));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveShipment(o: OrderPublic, opts: { mark_shipped?: boolean; mark_delivered?: boolean }) {
    const t = getToken();
    if (!t) return;
    setBusyId(o.id);
    setErr(null);
    try {
      const carrier = carrierEdits[o.id] ?? o.tracking_carrier ?? "";
      const num = numberEdits[o.id] ?? o.tracking_number ?? "";
      const updated = await adminPatchOrderShipment(t, o.id, {
        tracking_carrier: carrier.trim() || null,
        tracking_number: num.trim() || null,
        mark_shipped: opts.mark_shipped ?? false,
        mark_delivered: opts.mark_delivered ?? false,
      });
      setRows((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev));
    } catch (e) {
      setErr(e instanceof Error ? e.message : formatNetworkError(e));
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null && !err) {
    return <p className="text-sm text-stone-500">กำลังโหลดคำสั่งซื้อ…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200/90 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/80">
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-50">อัปเดตการจัดส่ง</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          ตั้งค่าเลขพัสดุ กด «ออกจากคลัง» เมื่อจัดส่งแล้ว และ «ส่งถึงแล้ว» เมื่อเสร็จสิ้น (ลูกค้าเห็นไทม์ไลน์ในหน้า Orders)
        </p>
      </div>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      {rows && rows.length === 0 ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">ยังไม่มีคำสั่งซื้อ</p>
      ) : null}

      {rows && rows.length > 0 ? (
        <ul className="space-y-4">
          {rows.map((o) => (
            <li
              key={o.id}
              className="rounded-2xl border border-stone-200/90 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  <span className="font-mono text-stone-700 dark:text-stone-300">{o.id.slice(0, 8)}…</span>
                  {" · "}
                  {new Date(o.created_at).toLocaleString()}
                  {" · "}
                  <span className="font-semibold text-teal-700 dark:text-teal-400">{o.status}</span>
                </p>
                <p className="text-lg font-bold tabular-nums text-stone-900 dark:text-stone-50">${o.total_amount.toFixed(2)}</p>
              </div>
              <ul className="mt-2 space-y-0.5 text-sm text-stone-700 dark:text-stone-300">
                {o.items.map((it) => (
                  <li key={`${o.id}-${it.product_id}-${it.variant_id ?? "x"}`}>
                    {it.product_name} × {it.quantity}
                  </li>
                ))}
              </ul>

              {o.status === "cancelled" ? (
                <p className="mt-3 text-xs text-stone-500">ยกเลิกแล้ว — แก้ขนส่งไม่ได้</p>
              ) : (
                <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3 dark:border-zinc-800 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                    ขนส่ง
                    <input
                      value={carrierEdits[o.id] ?? o.tracking_carrier ?? ""}
                      onChange={(e) => setCarrierEdits((m) => ({ ...m, [o.id]: e.target.value }))}
                      placeholder="เช่น Kerry, Thai Post"
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                    เลขพัสดุ
                    <input
                      value={numberEdits[o.id] ?? o.tracking_number ?? ""}
                      onChange={(e) => setNumberEdits((m) => ({ ...m, [o.id]: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-950"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => void saveShipment(o, { mark_shipped: true })}
                      className="rounded-xl bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
                    >
                      บันทึก / ออกจากคลัง (shipped)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => void saveShipment(o, { mark_delivered: true })}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-emerald-500"
                    >
                      ส่งถึงแล้ว (completed)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => void saveShipment(o, {})}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200"
                    >
                      บันทึกเลขอย่างเดียว
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
