"use client";

import { useEffect, useId, useState } from "react";

import type { Product } from "@/lib/api";
import { formatNetworkError, getToken, postPriceMatchReport } from "@/lib/api";

type Props = { product: Product };

export function ProductPriceMatchSection({ product }: Props) {
  const panelId = useId();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setSessionToken(getToken()));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      if (window.location.hash === "#price-match") setOpen(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const priceStr = (
    product.has_variants && product.variants?.length
      ? Math.min(...product.variants.map((v) => v.price))
      : product.price
  ).toFixed(2);

  const [reportedPrice, setReportedPrice] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const p = Number(reportedPrice);
    if (!Number.isFinite(p) || p <= 0) {
      setErr("กรุณากรอกราคาที่พบ (เป็นตัวเลขมากกว่า 0)");
      return;
    }
    const t = getToken();
    if (!t && !email.trim()) {
      setErr("กรุณากรอกอีเมลเพื่อให้ร้านติดต่อกลับ หรือเข้าสู่ระบบ");
      return;
    }
    setBusy(true);
    try {
      await postPriceMatchReport(
        product.id,
        {
          reported_price: p,
          competitor_url: competitorUrl.trim() || null,
          notes: notes.trim() || null,
          reporter_email: t ? (email.trim() || null) : email.trim(),
        },
        t,
      );
      setMsg("ส่งรายงานแล้ว — ทีมจะตรวจสอบตามนโยบายของร้าน");
      setReportedPrice("");
      setCompetitorUrl("");
      setNotes("");
      setEmail("");
    } catch (ex) {
      setErr(formatNetworkError(ex));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-stone-100 dark:placeholder:text-zinc-500";

  return (
    <section
      id="price-match"
      aria-label="รายงานราคาถูกกว่า"
      className="scroll-mt-24"
    >
      <div className="rounded-2xl border border-stone-200/70 bg-stone-50/50 dark:border-zinc-800/80 dark:bg-zinc-950/40">
        <button
          type="button"
          id={`${panelId}-trigger`}
          aria-expanded={open}
          aria-controls={`${panelId}-panel`}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-stone-100/80 dark:hover:bg-zinc-900/50 sm:px-5"
        >
          <span>
            <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">พบราคาถูกกว่า?</span>
            <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">
              เปิดเมื่อต้องการส่งลิงก์อ้างอิง · ราคาโชว์บนเว็บเราโดยประมาณ{" "}
              <span className="tabular-nums font-medium text-stone-700 dark:text-stone-300">${priceStr}</span>
            </span>
          </span>
          <span
            className={`shrink-0 text-stone-400 transition dark:text-zinc-500 ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          </span>
        </button>

        {open ? (
          <div
            id={`${panelId}-panel`}
            role="region"
            aria-labelledby={`${panelId}-trigger`}
            className="border-t border-stone-200/70 px-4 pb-4 pt-1 dark:border-zinc-800 sm:px-5"
          >
            <form onSubmit={(e) => void onSubmit(e)} className="mt-3 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                  ราคาที่พบ (USD) <span className="text-rose-600 dark:text-rose-400">*</span>
                  <input
                    required
                    inputMode="decimal"
                    value={reportedPrice}
                    onChange={(e) => setReportedPrice(e.target.value)}
                    placeholder="เช่น 19.99"
                    className={`${inputClass} tabular-nums sm:max-w-none`}
                  />
                </label>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 sm:col-span-1">
                  ลิงก์ร้านคู่แข่ง <span className="font-normal text-stone-400">(ไม่บังคับ)</span>
                  <input
                    type="url"
                    inputMode="url"
                    value={competitorUrl}
                    onChange={(e) => setCompetitorUrl(e.target.value)}
                    placeholder="https://…"
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                หมายเหตุ <span className="font-normal text-stone-400">(ไม่บังคับ)</span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น รวมค่าส่งแล้ว, มีโค้ดส่วนลด…"
                  className={`${inputClass} resize-y min-h-[4rem]`}
                />
              </label>
              {!sessionToken ? (
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                  อีเมลสำหรับติดต่อกลับ <span className="text-rose-600 dark:text-rose-400">*</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClass}
                  />
                </label>
              ) : (
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                  อีเมลเพิ่มเติม <span className="font-normal text-stone-400">(ไม่บังคับ — ใช้บัญชีที่ล็อกอินเป็นหลัก)</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </label>
              )}
              {err ? <p className="text-sm text-rose-700 dark:text-rose-300">{err}</p> : null}
              {msg ? <p className="text-sm text-emerald-800 dark:text-emerald-300">{msg}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-600/20 transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[11rem]"
              >
                {busy ? "กำลังส่ง…" : "ส่งรายงานราคา"}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  );
}
