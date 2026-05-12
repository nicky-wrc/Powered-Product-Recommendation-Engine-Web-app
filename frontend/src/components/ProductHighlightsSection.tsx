import Link from "next/link";

import type { Product } from "@/lib/api";

type Props = {
  product: Product;
  reviewCount: number;
  reviewAverage: number | null;
};

export function ProductHighlightsSection({ product, reviewCount, reviewAverage }: Props) {
  const categoryHref = product.category
    ? `/products?category=${encodeURIComponent(product.category)}`
    : null;
  const tags = product.tags?.filter(Boolean) ?? [];
  const stockLine =
    product.stock <= 0
      ? "สถานะสต็อกหมดชั่วคราว — แจ้งเตือนเมื่อกลับมามีของได้จากด้านบนของหน้านี้"
      : product.stock > 10
        ? `พร้อมส่งจำนวนมาก (คงเหลือประมาณ ${product.stock} ชิ้น)`
        : `พร้อมส่ง — เหลือไม่มาก (${product.stock} ชิ้น) แนะนำตัดสินใจเร็วหากต้องการจำนวนมาก`;

  const reviewLine =
    reviewCount > 0 && reviewAverage != null ? (
      <>
        มีรีวิวจากลูกค้าแล้ว{" "}
        <span className="font-semibold text-amber-700 tabular-nums dark:text-amber-400">{reviewCount}</span> รายการ
        · คะแนนเฉลี่ย{" "}
        <span className="font-semibold text-amber-700 tabular-nums dark:text-amber-400">{reviewAverage.toFixed(1)}</span> / 5 —{" "}
        <a href="#product-reviews" className="font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
          อ่านรีวิว
        </a>
      </>
    ) : (
      <>
        ยังไม่มีรีวิวสาธิตสำหรับสินค้านี้ — ลูกค้าที่เคยสั่งซื้อและออเดอร์สำเร็จสามารถรีวิวได้จาก{" "}
        <a href="#product-reviews" className="font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
          การ์ดด้านล่าง
        </a>
      </>
    );

  return (
    <section className="space-y-5 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">สรุปจุดเด่น (at a glance)</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          ข้อมูลย่อจากหน้านี้ — ใช้ประกอบการตัดสินใจก่อนอ่านรายละเอียดแบบเต็ม
        </p>
      </div>
      <ul className="space-y-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
        <li className="flex gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800 dark:bg-teal-950/80 dark:text-teal-200"
            aria-hidden
          >
            1
          </span>
          <span>
            <span className="font-semibold text-stone-900 dark:text-stone-100">หมวดหมู่</span>
            <span className="mt-0.5 block">
              {product.category ? (
                <>
                  {categoryHref ? (
                    <Link
                      href={categoryHref}
                      className="font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                    >
                      {product.category}
                    </Link>
                  ) : (
                    product.category
                  )}
                  <span> — เปิดดูสินค้าในหมวดเดียวกันได้จากลิงก์</span>
                </>
              ) : (
                "ไม่ได้ระบุหมวดในรายการ — ใช้แถบค้นหาและกรองที่แคตตาล็อกแทน"
              )}
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800 dark:bg-teal-950/80 dark:text-teal-200"
            aria-hidden
          >
            2
          </span>
          <span>
            <span className="font-semibold text-stone-900 dark:text-stone-100">แท็ก</span>
            <span className="mt-0.5 block">
              {tags.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-800 dark:bg-zinc-800 dark:text-stone-200"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              ) : (
                "ยังไม่มีแท็กสำหรับสินค้านี้"
              )}
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800 dark:bg-teal-950/80 dark:text-teal-200"
            aria-hidden
          >
            3
          </span>
          <span>
            <span className="font-semibold text-stone-900 dark:text-stone-100">สต็อก</span>
            <span className="mt-0.5 block">{stockLine}</span>
          </span>
        </li>
        <li className="flex gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800 dark:bg-teal-950/80 dark:text-teal-200"
            aria-hidden
          >
            4
          </span>
          <span>
            <span className="font-semibold text-stone-900 dark:text-stone-100">ราคาและรีวิว</span>
            <span className="mt-0.5 block">
              ราคาปัจจุบัน{" "}
              <span className="font-bold tabular-nums text-teal-700 dark:text-teal-400">${product.price.toFixed(2)}</span>
              {" · "}
              {reviewLine}
            </span>
          </span>
        </li>
      </ul>
    </section>
  );
}
