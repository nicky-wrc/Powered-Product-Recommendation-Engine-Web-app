import Link from "next/link";

type Props = { category: string | null };

/** การ์ดปิดท้ายหน้าสินค้า — ทางลัดก่อนออกจาก PDP */
export function ProductPageClosingSection({ category }: Props) {
  const categoryHref = category ? `/products?category=${encodeURIComponent(category)}` : null;

  return (
    <section
      aria-label="ทางลัดท้ายหน้าสินค้า"
      className="rounded-3xl border border-stone-200/90 bg-gradient-to-br from-stone-50/95 to-teal-50/30 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-950/90 dark:to-teal-950/20"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">จบการดูสินค้านี้แล้ว?</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            กลับไปช้อปต่อ ตรวจตะกร้า หรือกระโดดไปรีวิวได้จากปุ่มด้านขวา
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="#product-reviews"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
          >
            ขึ้นไปรีวิว
          </a>
          <Link
            href="/cart"
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
          >
            ตะกร้า
          </Link>
          <Link
            href="/products"
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
          >
            แคตตาล็อก
          </Link>
          {categoryHref ? (
            <Link
              href={categoryHref}
              className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-900 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-100 dark:hover:bg-teal-900/40"
            >
              หมวดเดียวกัน
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
