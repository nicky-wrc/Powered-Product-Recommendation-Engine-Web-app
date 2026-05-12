"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAppModal } from "@/components/AppModalProvider";
import {
  API_BASE,
  deleteMyProductReview,
  fetchProductReviewEligibility,
  fetchProductReviews,
  formatNetworkError,
  getToken,
  type ProductReview,
  type ProductReviewEligibility,
  type ReviewSummary,
  uploadReviewImage,
  upsertProductReview,
} from "@/lib/api";

function reviewImageSrc(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/uploads/")) {
    const base = (typeof window !== "undefined" && !API_BASE ? window.location.origin : API_BASE || "").replace(
      /\/$/,
      "",
    );
    return `${base}${pathOrUrl}`;
  }
  return pathOrUrl;
}

function StarRow({
  value,
  onChange,
  disabled,
  readOnly,
}: {
  value: number;
  onChange?: (n: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  if (readOnly || !onChange) {
    return (
      <span className="flex gap-0.5" aria-label={`${value} จาก 5 ดาว`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`text-lg leading-none ${n <= value ? "text-amber-500" : "text-stone-300 dark:text-zinc-600"}`}>
            ★
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="คะแนนดาว">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`text-lg leading-none transition ${n <= value ? "text-amber-500" : "text-stone-300 dark:text-zinc-600"} ${
            !disabled ? "cursor-pointer hover:scale-110" : ""
          } disabled:cursor-default disabled:opacity-50`}
          aria-pressed={n <= value}
        >
          ★
        </button>
      ))}
    </div>
  );
}

type Props = {
  productId: string;
  initialSummary: ReviewSummary;
  initialEligibility: ProductReviewEligibility;
};

export function ProductReviewsSection({ productId, initialSummary, initialEligibility }: Props) {
  const { confirm } = useAppModal();
  const [summary, setSummary] = useState(initialSummary);
  const [items, setItems] = useState<ProductReview[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [extraUrls, setExtraUrls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const [formSeeded, setFormSeeded] = useState(false);

  const [eligibility, setEligibility] = useState<ProductReviewEligibility>(initialEligibility);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);

  useEffect(() => {
    setEligibility(initialEligibility);
  }, [initialEligibility]);

  useEffect(() => {
    let cancelled = false;
    setEligibilityLoading(true);
    void (async () => {
      try {
        const e = await fetchProductReviewEligibility(productId, getToken());
        if (!cancelled) setEligibility(e);
      } catch {
        if (!cancelled) setEligibility({ can_submit_review: false, reason: null });
      } finally {
        if (!cancelled) setEligibilityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const loadPage = useCallback(
    async (p: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const r = await fetchProductReviews(productId, p);
        setSummary({ count: r.total, average: r.average ?? null });
        if (append) setItems((prev) => [...prev, ...r.items]);
        else setItems(r.items);
        setPage(r.page);
        setTotalPages(Math.max(1, r.total_pages));
      } catch (e) {
        setFormErr(formatNetworkError(e));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [productId],
  );

  useEffect(() => {
    void loadPage(1, false);
  }, [loadPage]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = getToken();
    if (!t) return;
    setFormErr(null);
    setFormOk(null);
    setSubmitting(true);
    try {
      const uploaded: string[] = [];
      for (const f of pendingFiles.slice(0, 4)) {
        const { url } = await uploadReviewImage(t, f);
        uploaded.push(url);
      }
      const pasted = extraUrls
        .split(/[\s,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, Math.max(0, 4 - uploaded.length));
      const image_urls = [...uploaded, ...pasted].slice(0, 4);
      const res = await upsertProductReview(t, productId, {
        rating,
        title: title.trim() || null,
        body: body.trim() || null,
        image_urls: image_urls.length ? image_urls : null,
      });
      setSummary(res.review_summary);
      setPendingFiles([]);
      setExtraUrls("");
      setFormOk("บันทึกรีวิวแล้ว");
      setFormSeeded(true);
      try {
        setEligibility(await fetchProductReviewEligibility(productId, getToken()));
      } catch {
        setEligibility({ can_submit_review: true, reason: null });
      }
      await loadPage(1, false);
    } catch (e) {
      setFormErr(formatNetworkError(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteMine() {
    const t = getToken();
    if (!t) return;
    const ok = await confirm({
      title: "ลบรีวิว",
      message: "ลบรีวิวของคุณสำหรับสินค้านี้?",
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    setFormErr(null);
    setFormOk(null);
    setSubmitting(true);
    try {
      const s = await deleteMyProductReview(t, productId);
      setSummary(s);
      setRating(5);
      setTitle("");
      setBody("");
      setFormOk("ลบรีวิวแล้ว");
      setFormSeeded(false);
      try {
        setEligibility(await fetchProductReviewEligibility(productId, getToken()));
      } catch {
        /* keep current */
      }
      await loadPage(1, false);
    } catch (e) {
      setFormErr(formatNetworkError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const mine = items.find((x) => x.is_mine);

  useEffect(() => {
    if (loading || formSeeded || !mine) return;
    setRating(mine.rating);
    setTitle(mine.title ?? "");
    setBody(mine.body ?? "");
    setFormSeeded(true);
  }, [loading, formSeeded, mine]);

  return (
    <section className="space-y-6 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">รีวิวจากลูกค้า</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-stone-600 dark:text-stone-400">
          {summary.count > 0 && summary.average != null ? (
            <>
              <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {summary.average.toFixed(1)} / 5
              </span>
              <StarRow value={Math.round(summary.average)} readOnly />
              <span className="text-stone-500">({summary.count} รีวิว)</span>
            </>
          ) : summary.count > 0 ? (
            <span>{summary.count} รีวิว</span>
          ) : (
            <span>ยังไม่มีรีวิว — ลูกค้าที่เคยสั่งซื้อสินค้านี้แล้ว (ออเดอร์สำเร็จ) สามารถรีวิวได้</span>
          )}
        </div>
      </div>

      {getToken() ? (
        eligibilityLoading ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">กำลังตรวจสอบสิทธิ์รีวิว…</p>
      ) : eligibility.can_submit_review ? (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 rounded-2xl border border-stone-200/80 bg-stone-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{mine ? "แก้ไขรีวิวของคุณ" : "เขียนรีวิว"}</p>
          <div>
            <p className="mb-1 text-xs text-stone-500">ให้คะแนน</p>
            <StarRow value={rating} onChange={setRating} disabled={submitting} />
          </div>
          <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
            หัวข้อ (ไม่บังคับ)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
            รายละเอียด
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={8000}
              className="mt-1 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
            แนบรูป (สูงสุด 4 รูป — JPG/PNG/WebP ฯลฯ)
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={submitting}
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files).slice(0, 4) : [];
                setPendingFiles(files);
              }}
              className="mt-1 block w-full text-xs"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
            หรือ URL รูป (คั่นด้วยเว้นวรรค — รวมกับไฟล์ได้ไม่เกิน 4)
            <input
              value={extraUrls}
              onChange={(e) => setExtraUrls(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </label>
          {formErr ? <p className="text-sm text-red-600 dark:text-red-400">{formErr}</p> : null}
          {formOk ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{formOk}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              {submitting ? "กำลังส่ง…" : mine ? "อัปเดตรีวิว" : "ส่งรีวิว"}
            </button>
            {mine ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void onDeleteMine()}
                className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-400"
              >
                ลบรีวิวของฉัน
              </button>
            ) : null}
          </div>
        </form>
      ) : eligibility.reason === "purchase" ? (
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">รีวิวได้เมื่อเคยสั่งซื้อสินค้านี้แล้วเท่านั้น</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            ระบบนับเฉพาะออเดอร์ที่สถานะ <strong className="font-semibold">สำเร็จ</strong> เท่านั้น
          </p>
          <p className="mt-2">
            <Link href="/orders" className="font-semibold text-teal-800 underline dark:text-teal-400">
              ดูประวัติคำสั่งซื้อ
            </Link>
          </p>
        </div>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-400">ไม่สามารถส่งรีวิวได้ในขณะนี้</p>
      )
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          <Link href={`/login?next=/products/${productId}`} className="font-semibold text-teal-700 underline dark:text-teal-400">
            เข้าสู่ระบบ
          </Link>{" "}
          เพื่อเขียนรีวิว
        </p>
      )}

      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-stone-500">กำลังโหลดรีวิว…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-stone-500">ยังไม่มีรีวิวในรายการนี้</p>
        ) : (
          items.map((rev) => (
            <article
              key={rev.id}
              className="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{rev.author_name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StarRow value={rev.rating} readOnly />
                    <time className="text-xs text-stone-500 tabular-nums" dateTime={rev.created_at}>
                      {new Date(rev.created_at).toLocaleString()}
                    </time>
                  </div>
                </div>
                {rev.is_mine ? (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900 dark:bg-teal-950 dark:text-teal-200">
                    รีวิวของคุณ
                  </span>
                ) : null}
              </div>
              {rev.title ? <p className="mt-2 font-medium text-stone-800 dark:text-stone-200">{rev.title}</p> : null}
              {rev.body ? <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{rev.body}</p> : null}
              {rev.image_urls?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {rev.image_urls.map((u) => (
                    <a
                      key={u}
                      href={reviewImageSrc(u)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-stone-200 dark:ring-zinc-600"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user/remote URLs */}
                      <img src={reviewImageSrc(u)} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
        {!loading && page < totalPages ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadPage(page + 1, true)}
            className="text-sm font-semibold text-teal-700 underline dark:text-teal-400 disabled:opacity-50"
          >
            {loadingMore ? "กำลังโหลด…" : "โหลดรีวิวเพิ่ม"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
