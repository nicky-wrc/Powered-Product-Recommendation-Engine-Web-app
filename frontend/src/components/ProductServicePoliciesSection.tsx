import Link from "next/link";

import type { Product } from "@/lib/api";

type Props = { product: Product };

export function ProductServicePoliciesSection({ product }: Props) {
  const tagList = product.tags?.filter(Boolean) ?? [];
  const stockLabel =
    product.stock <= 0
      ? "หมดชั่วคราว"
      : product.stock > 10
        ? `พร้อมส่ง (${product.stock} ชิ้น)`
        : `เหลือน้อย (${product.stock} ชิ้น)`;

  return (
    <section className="space-y-6 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">ข้อมูลสินค้า & นโยบายบริการ</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          สรุปรายละเอียดสำหรับการตัดสินใจ และเงื่อนไขบริการแบบเดโมร้านค้า
        </p>
      </div>

      <dl className="grid gap-3 rounded-2xl border border-stone-200/70 bg-stone-50/60 px-4 py-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/40 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-500">รหัสสินค้า</dt>
          <dd className="mt-0.5 font-mono text-xs text-stone-800 dark:text-stone-200">{product.id}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-500">หมวดหมู่</dt>
          <dd className="mt-0.5 text-stone-800 dark:text-stone-200">{product.category ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-500">สถานะสต็อก</dt>
          <dd className="mt-0.5 text-stone-800 dark:text-stone-200">{stockLabel}</dd>
        </div>
        {tagList.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-500">แท็ก</dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {tagList.map((t) => (
                <span
                  key={t}
                  className="rounded-lg bg-white px-2 py-0.5 text-xs text-stone-700 ring-1 ring-stone-200 dark:bg-zinc-950 dark:text-stone-300 dark:ring-zinc-700"
                >
                  {t}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 3.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.25 2.25 0 0 0-1.94-1.095H16.5M3.375 14.25h12.885a2.25 2.25 0 0 0 1.94-1.095 17.902 17.902 0 0 0 3.213-9.193 1.125 1.125 0 0 0-1.09-1.124H12.75M3.375 14.25v-4.875c0-.621.504-1.125 1.125-1.125h6.75c.621 0 1.125.504 1.125 1.125v4.875m-9 0h9.75"
              />
            </svg>
          </div>
          <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">การจัดส่ง</h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            จัดส่งภายใน 2–5 วันทำการ (ข้อมูลจำลอง) ค่าจัดส่งคิดตามโซน — ดูรายละเอียดที่หน้าตะกร้าก่อนยืนยันคำสั่งซื้อ
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </div>
          <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">การคืนสินค้า</h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            รับคืนภายใน 14 วันหลังได้รับสินค้า หากสินค้าอยู่ในสภาพเดิม (ข้อมูลจำลอง — ไม่มีกระบวนการคืนจริงในเดโม)
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-200 text-stone-800 dark:bg-zinc-700 dark:text-stone-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h3 className="mt-3 font-semibold text-stone-900 dark:text-stone-100">ช่วยเหลือ</h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            มีคำถามเกี่ยวกับคำสั่งซื้อหรือสินค้า? ดูประวัติและสถานะได้ที่{" "}
            <Link href="/orders" className="font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
              คำสั่งซื้อของฉัน
            </Link>
          </p>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-500">
        ข้อความด้านบนเป็นเนื้อหาสาธิตสำหรับ UI เท่านั้น — ไม่ผูกกับนโยบายทางกฎหมายหรือ SLA จริงของร้าน
      </p>
    </section>
  );
}
