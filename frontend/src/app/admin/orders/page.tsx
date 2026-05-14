"use client";

import { useCallback, useEffect, useState, startTransition } from "react";

import { useAppModal } from "@/components/AppModalProvider";
import {
  adminListOrders,
  adminPatchOrderShipment,
  getToken,
  formatNetworkError,
  type OrderPublic,
} from "@/lib/api";
import { formatOrderShippingLines, hasOrderShippingSnapshot } from "@/lib/orderShippingDisplay";
import { usePollWhileVisible } from "@/lib/usePollWhileVisible";

const CARRIER_CHIPS = ["Flash", "Kerry Express", "J&T Express", "Thailand Post", "DHL", "Grab"];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "processing", label: "รอจัดส่ง" },
  { value: "shipped", label: "กำลังส่ง" },
  { value: "completed", label: "สำเร็จ" },
  { value: "cancelled", label: "ยกเลิก" },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "text-emerald-700 dark:text-emerald-400";
    case "shipped":
      return "text-sky-700 dark:text-sky-400";
    case "processing":
      return "text-amber-800 dark:text-amber-300";
    case "cancelled":
      return "text-rose-700 dark:text-rose-400";
    default:
      return "text-stone-600 dark:text-stone-400";
  }
}

export default function AdminOrdersPage() {
  const { confirm, alert } = useAppModal();
  const [rows, setRows] = useState<OrderPublic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [carrierEdits, setCarrierEdits] = useState<Record<string, string>>({});
  const [numberEdits, setNumberEdits] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [okFlash, setOkFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setErr("ไม่พบเซสชัน");
      setRows([]);
      return;
    }
    setErr(null);
    try {
      const list = await adminListOrders(t, {
        limit: 100,
        status: statusFilter.trim() || undefined,
      });
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : formatNetworkError(e));
      setRows([]);
    }
  }, [statusFilter]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  usePollWhileVisible(() => void load(), 16_000, rows !== null);

  async function saveShipment(o: OrderPublic, opts: { mark_shipped?: boolean; mark_delivered?: boolean }) {
    const carrier = (carrierEdits[o.id] ?? o.tracking_carrier ?? "").trim();
    const num = (numberEdits[o.id] ?? o.tracking_number ?? "").trim();
    if (opts.mark_shipped) {
      const ok = await confirm({
        title: "ยืนยันออกจากคลัง (shipped)",
        message: `ออเดอร์ ${o.id.slice(0, 8)}…\n\nบันทึกขนส่ง: ${carrier || "—"}\nเลขพัสดุ: ${num || "—"}\n\nเปลี่ยนสถานะเป็น shipped (หรืออัปเวลาจัดส่งถ้าเป็น shipped อยู่แล้ว)`,
        confirmLabel: "ยืนยัน",
        cancelLabel: "ยกเลิก",
      });
      if (!ok) return;
    } else if (opts.mark_delivered) {
      const ok = await confirm({
        title: "ยืนยันส่งถึงแล้ว (completed)",
        message: `ออเดอร์ ${o.id.slice(0, 8)}…\n\nลูกค้าได้รับสินค้าแล้ว — ระบบจะตั้งสถานะเป็น completed และอัปเวลาจัดส่งถ้ายังไม่มี`,
        confirmLabel: "ยืนยัน",
        cancelLabel: "ยกเลิก",
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: "บันทึกเลขพัสดุอย่างเดียว",
        message: `ออเดอร์ ${o.id.slice(0, 8)}…\n\nบันทึกขนส่ง / เลขพัสดุโดยไม่เปลี่ยนสถานะหลักของออเดอร์`,
        confirmLabel: "บันทึก",
        cancelLabel: "ยกเลิก",
      });
      if (!ok) return;
    }

    const t = getToken();
    if (!t) return;
    setBusyId(o.id);
    setErr(null);
    setOkFlash(null);
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
      setOkFlash(`อัปเดตออเดอร์ ${o.id.slice(0, 8)}… แล้ว`);
      window.setTimeout(() => setOkFlash(null), 3500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : formatNetworkError(e);
      setErr(msg);
      await alert({ title: "บันทึกไม่สำเร็จ", message: msg });
    } finally {
      setBusyId(null);
    }
  }

  function copyText(label: string, text: string) {
    if (!text.trim()) {
      void alert({ title: "คัดลอกไม่ได้", message: "ยังไม่มีข้อความให้คัดลอก" });
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => {
        setOkFlash(`${label} คัดลอกแล้ว`);
        window.setTimeout(() => setOkFlash(null), 2500);
      },
      () => void alert({ title: "คัดลอกไม่สำเร็จ", message: "เบราว์เซอร์ไม่อนุญาตให้คัดลอก" }),
    );
  }

  if (rows === null && !err) {
    return <p className="text-sm text-stone-500">กำลังโหลดคำสั่งซื้อ…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200/90 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-50">จัดการการจัดส่ง</h2>
            <p className="mt-1 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
              เลือกออเดอร์จากแท็บสถานะ กรอกขนส่งและเลขพัสดุ จากนั้นใช้ปุ่มด้านล่างการ์ด — ปุ่มที่เปลี่ยนสถานะจะถามยืนยันในกล่องโต้ตอบก่อนบันทึก
            </p>
          </div>
          <button
            type="button"
            disabled={busyId != null}
            onClick={() => void load()}
            className="shrink-0 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
          >
            รีเฟรช
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === f.value
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-stone-300 dark:hover:bg-zinc-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {okFlash ? (
        <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          {okFlash}
        </div>
      ) : null}

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      {rows && rows.length === 0 ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">ไม่มีคำสั่งซื้อในตัวกรองนี้</p>
      ) : null}

      {rows && rows.length > 0 ? (
        <ul className="space-y-5">
          {rows.map((o) => (
            <li
              key={o.id}
              className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-md shadow-stone-900/[0.06] dark:border-zinc-800 dark:bg-zinc-950/95"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    <span className="font-mono text-stone-800 dark:text-stone-200">{o.id.slice(0, 8)}…</span>
                    <span className="mx-1.5">·</span>
                    {new Date(o.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1">
                    <span className={`text-sm font-semibold ${statusBadgeClass(o.status)}`}>{o.status}</span>
                  </p>
                </div>
                <p className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
                  ${o.total_amount.toFixed(2)}
                </p>
              </div>

              <ul className="mt-3 space-y-0.5 border-t border-stone-100 pt-3 text-sm text-stone-800 dark:border-zinc-800 dark:text-stone-200">
                {o.items.map((it) => (
                  <li key={`${o.id}-${it.product_id}-${it.variant_id ?? "x"}`}>
                    {it.product_name} × {it.quantity}
                  </li>
                ))}
              </ul>

              <div className="mt-3 border-t border-stone-100 pt-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600 dark:text-stone-400">
                    จัดส่งถึงลูกค้า
                  </h3>
                  {hasOrderShippingSnapshot(o) ? (
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() =>
                        copyText("ที่อยู่จัดส่ง", formatOrderShippingLines(o).join("\n"))
                      }
                      className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
                    >
                      คัดลอกที่อยู่
                    </button>
                  ) : null}
                </div>
                {hasOrderShippingSnapshot(o) ? (
                  <address className="mt-2 whitespace-pre-line text-sm not-italic leading-relaxed text-stone-800 dark:text-stone-200">
                    {formatOrderShippingLines(o).join("\n")}
                  </address>
                ) : (
                  <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                    ไม่มีข้อมูลที่อยู่ในออเดอร์นี้ (คำสั่งซื้อเก่าก่อนบันทึกที่อยู่ หรือข้อมูลจากระบบเก่า)
                  </p>
                )}
              </div>

              {o.status === "cancelled" ? (
                <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">ยกเลิกแล้ว — แก้ขนส่งไม่ได้</p>
              ) : (
                <div className="mt-4 space-y-3 border-t border-stone-100 pt-4 dark:border-zinc-800">
                  <div className="flex flex-wrap gap-2">
                    <span className="w-full text-xs font-medium text-stone-500 dark:text-stone-400">เลือกขนส่งยอดนิยม</span>
                    {CARRIER_CHIPS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={busyId === o.id}
                        onClick={() => setCarrierEdits((m) => ({ ...m, [o.id]: c }))}
                        className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                      ขนส่ง
                      <input
                        value={carrierEdits[o.id] ?? o.tracking_carrier ?? ""}
                        onChange={(e) => setCarrierEdits((m) => ({ ...m, [o.id]: e.target.value }))}
                        placeholder="เช่น Flash, Kerry"
                        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                      />
                    </label>
                    <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                      เลขพัสดุ
                      <input
                        value={numberEdits[o.id] ?? o.tracking_number ?? ""}
                        onChange={(e) => setNumberEdits((m) => ({ ...m, [o.id]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-950"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() =>
                        copyText(
                          "เลขพัสดุ",
                          (numberEdits[o.id] ?? o.tracking_number ?? "").trim() +
                            ((carrierEdits[o.id] ?? o.tracking_carrier ?? "").trim()
                              ? ` (${(carrierEdits[o.id] ?? o.tracking_carrier ?? "").trim()})`
                              : ""),
                        )
                      }
                      className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
                    >
                      คัดลอกเลข + ขนส่ง
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3 dark:border-zinc-800">
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => void saveShipment(o, { mark_shipped: true })}
                      className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
                    >
                      บันทึก / ออกจากคลัง (shipped)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => void saveShipment(o, { mark_delivered: true })}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 hover:bg-emerald-500"
                    >
                      ส่งถึงแล้ว (completed)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => void saveShipment(o, {})}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200"
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
