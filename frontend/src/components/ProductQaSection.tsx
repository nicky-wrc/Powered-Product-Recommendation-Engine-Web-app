"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, startTransition } from "react";

import { useAppModal } from "@/components/AppModalProvider";
import {
  deleteAdminProductQuestion,
  fetchMe,
  fetchProductQa,
  formatNetworkError,
  getToken,
  postAdminProductQaAnswer,
  postProductQuestion,
  type ProductQaItem,
  type User,
} from "@/lib/api";

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type Props = { productId: string };

export function ProductQaSection({ productId }: Props) {
  const { confirm } = useAppModal();
  const [items, setItems] = useState<ProductQaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<User | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [list, token] = await Promise.all([fetchProductQa(productId), Promise.resolve(getToken())]);
      setItems(list);
      if (token) {
        try {
          setMe(await fetchMe(token));
        } catch {
          setMe(null);
        }
      } else {
        setMe(null);
      }
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    const text = draft.trim();
    if (text.length < 3) return;
    setBusy(true);
    setErr(null);
    try {
      const next = await postProductQuestion(token, productId, text);
      setItems(next);
      setDraft("");
    } catch (ex) {
      setErr(formatNetworkError(ex));
    } finally {
      setBusy(false);
    }
  }

  async function onAnswer(questionId: string) {
    const token = getToken();
    if (!token || !me?.is_admin) return;
    const text = (answerDrafts[questionId] ?? "").trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await postAdminProductQaAnswer(token, productId, questionId, text);
      setItems((prev) => prev.map((row) => (row.id === questionId ? updated : row)));
      setAnswerDrafts((ad) => ({ ...ad, [questionId]: "" }));
    } catch (ex) {
      setErr(formatNetworkError(ex));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteQuestion(questionId: string) {
    const token = getToken();
    if (!token || !me?.is_admin) return;
    const ok = await confirm({
      title: "ลบคำถาม",
      message: "ลบคำถามและคำตอบ (ถ้ามี) ออกจากหน้านี้?",
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAdminProductQuestion(token, productId, questionId);
      setItems((prev) => prev.filter((row) => row.id !== questionId));
    } catch (ex) {
      setErr(formatNetworkError(ex));
    } finally {
      setBusy(false);
    }
  }

  const token = typeof window !== "undefined" ? getToken() : null;

  return (
    <section
      id="product-qa"
      className="space-y-5 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90"
    >
      <div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">คำถาม &amp; คำตอบ</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          ถามรายละเอียดสินค้า — ทีมร้านจะตอบเมื่อตรวจสอบแล้ว
        </p>
      </div>

      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </p>
      ) : null}

      {token ? (
        <form onSubmit={(e) => void onAsk(e)} className="space-y-2 rounded-2xl border border-stone-200/80 bg-stone-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
          <label className="block text-sm font-medium text-stone-800 dark:text-stone-200">ตั้งคำถามใหม่</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="เช่น วัสดุเป็นหนังแท้หรือสังเคราะห์? มีสีอื่นไหม?"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-stone-500">{draft.trim().length}/4000</span>
            <button
              type="submit"
              disabled={busy || draft.trim().length < 3}
              className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50"
            >
              {busy ? "กำลังส่ง…" : "ส่งคำถาม"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          <Link href={`/login?next=/products/${productId}#product-qa`} className="font-semibold text-teal-700 underline dark:text-teal-400">
            เข้าสู่ระบบ
          </Link>{" "}
          เพื่อตั้งคำถาม
        </p>
      )}

      {loading ? (
        <p className="text-sm text-stone-500">กำลังโหลดคำถาม…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">ยังไม่มีคำถาม — เป็นคนแรกที่ถามได้</p>
      ) : (
        <ul className="space-y-4">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
            >
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Q: {row.question}</p>
              <p className="mt-1 text-xs text-stone-500">
                {row.asker_name} · {formatTs(row.created_at)}
                {row.is_mine ? " · คำถามของคุณ" : null}
              </p>
              {row.answer ? (
                <div className="mt-3 border-l-2 border-teal-500/70 pl-3">
                  <p className="text-sm text-stone-800 dark:text-stone-200">
                    <span className="font-semibold text-teal-800 dark:text-teal-300">คำตอบจากร้าน: </span>
                    {row.answer.body}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {row.answer.author_name} · {formatTs(row.answer.created_at)}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-amber-800/90 dark:text-amber-200/90">รอทีมร้านตอบ</p>
              )}

              {me?.is_admin ? (
                <div className="mt-4 space-y-2 border-t border-stone-200/70 pt-3 dark:border-zinc-700">
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-800 dark:text-teal-300">แอดมิน</p>
                  <textarea
                    value={answerDrafts[row.id] ?? ""}
                    onChange={(e) => setAnswerDrafts((ad) => ({ ...ad, [row.id]: e.target.value }))}
                    rows={2}
                    maxLength={8000}
                    placeholder={row.answer ? "แก้ไขคำตอบ…" : "พิมพ์คำตอบ…"}
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !(answerDrafts[row.id] ?? "").trim()}
                      onClick={() => void onAnswer(row.id)}
                      className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
                    >
                      {row.answer ? "อัปเดตคำตอบ" : "ส่งคำตอบ"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDeleteQuestion(row.id)}
                      className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:text-rose-200"
                    >
                      ลบคำถาม
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
