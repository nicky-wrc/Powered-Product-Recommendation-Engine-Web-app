import Link from "next/link";

type Props = { category: string | null };

export function ProductExploreTrustSection({ category }: Props) {
  const categoryHref = category
    ? `/products?category=${encodeURIComponent(category)}`
    : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-stone-200/90 dark:lg:divide-zinc-800">
        <div className="space-y-4 p-6">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">ช้อปต่อ</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              ลิงก์ด่วนจากหน้าสินค้านี้ — ไม่ต้องย้อนกลับไปเมนูหลัก
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products"
              className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 hover:from-teal-500 hover:to-emerald-500"
            >
              แคตตาล็อกทั้งหมด
            </Link>
            {categoryHref ? (
              <Link
                href={categoryHref}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
              >
                หมวดเดียวกัน{category ? ` · ${category}` : ""}
              </Link>
            ) : null}
            <Link
              href="/compare"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
            >
              เปรียบเทียบสินค้า
            </Link>
            <Link
              href="/cart"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
            >
              ตะกร้า
            </Link>
            <Link
              href="/orders"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
            >
              คำสั่งซื้อของฉัน
            </Link>
          </div>
        </div>

        <div className="space-y-4 bg-stone-50/80 p-6 dark:bg-zinc-900/40">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">ทำไมถึงไว้ใจร้านเดโมนี้</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              ข้อความด้านล่างใช้ประกอบ UI เท่านั้น — ไม่ใช่การรับรองจากบุคคลที่สาม
            </p>
          </div>
          <ul className="space-y-3 text-sm text-stone-700 dark:text-stone-300">
            <li className="flex gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-stone-200 dark:bg-zinc-950 dark:text-teal-400 dark:ring-zinc-700"
                aria-hidden
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              </span>
              <span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">ชำระผ่าน Stripe (test)</span>
                <span className="mt-0.5 block text-stone-600 dark:text-stone-400">
                  รองรับการชำระแบบทดสอบเมื่อตั้งค่า key — ข้อมูลบัตรผ่าน Stripe ไม่ผ่านแอปนี้
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-stone-200 dark:bg-zinc-950 dark:text-teal-400 dark:ring-zinc-700"
                aria-hidden
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </span>
              <span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">เช็คเอาต์เดโม</span>
                <span className="mt-0.5 block text-stone-600 dark:text-stone-400">
                  สร้างออเดอร์และหักสต็อกในสภาพแวดล้อมสาธิต — ไม่มีการเรียกเก็บเงินจริงเมื่อเลือกโหมดเดโม
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-stone-200 dark:bg-zinc-950 dark:text-teal-400 dark:ring-zinc-700"
                aria-hidden
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                  />
                </svg>
              </span>
              <span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">บัญชีและประวัติคำสั่งซื้อ</span>
                <span className="mt-0.5 block text-stone-600 dark:text-stone-400">
                  ล็อกอินเพื่อซิงก์ตะกร้าและดูคำสั่งซื้อในที่เดียว — ข้อมูลโปรไฟล์ตามที่ตั้งในเดโม
                </span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
