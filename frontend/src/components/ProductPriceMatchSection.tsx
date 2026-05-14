"use client";

import { useEffect, useState } from "react";

import type { Product } from "@/lib/api";
import { formatNetworkError, getToken, postPriceMatchReport } from "@/lib/api";

type Props = { product: Product };

export function ProductPriceMatchSection({ product }: Props) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  useEffect(() => {
    queueMicrotask(() => setSessionToken(getToken()));
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
      setMsg("ส่งรายงานแล้ว — ทีมจะตรวจสอบตามนโยบาย price match");
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

  return (
    <section
      aria-label="Price match report"
      className="rounded-xl border border-stone-200/90 bg-white/80 px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50"
    >
      <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">พบราคาถูกกว่า?</h2>
      <p className="mt-1 text-xs leading-snug text-stone-600 dark:text-stone-400">
        แจ้งลิงก์และราคาที่เห็น (ราคาโชว์บนเว็บเราโดยประมาณ{" "}
        <span className="tabular-nums font-medium text-stone-800 dark:text-stone-200">${priceStr}</span> — อาจแตกต่างตาม
        variant) แอดมินจะพิจารณาตามนโยบายของร้าน
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
          ราคาที่พบ (USD)
          <input
            required
            inputMode="decimal"
            value={reportedPrice}
            onChange={(e) => setReportedPrice(e.target.value)}
            placeholder="เช่น 19.99"
            className="mt-1 w-full max-w-[12rem] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
          ลิงก์ร้านคู่แข่ง (ไม่บังคับ)
          <input
            type="url"
            inputMode="url"
            value={competitorUrl}
            onChange={(e) => setCompetitorUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
          หมายเหตุ (ไม่บังคับ)
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="เช่น รวมค่าส่งแล้ว, โค้ดส่วนลด…"
            className="mt-1 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        {!sessionToken ? (
          <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
            อีเมลสำหรับติดต่อกลับ
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full max-w-md rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
        ) : (
          <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
            อีเมลเพิ่มเติม (ไม่บังคับ — เราเชื่อมบัญชีของคุณแล้ว)
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
        )}
        {err ? <p className="text-sm text-rose-700 dark:text-rose-300">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-800 dark:text-emerald-300">{msg}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
        >
          {busy ? "กำลังส่ง…" : "ส่งรายงานราคา"}
        </button>
      </form>
    </section>
  );
}
