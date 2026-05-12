import { sustainabilityBadgeLabel } from "@/lib/sustainabilityBadge";
import type { Product } from "@/lib/api";

type Props = { product: Pick<Product, "tags" | "category" | "name" | "description"> };

/** แสดงเมื่อ hero มี Sustainability badge — ขยายความแบบเดโม */
export function ProductSustainabilitySection({ product }: Props) {
  const label = sustainabilityBadgeLabel(product);
  if (!label) return null;

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-teal-50/40 p-6 shadow-sm dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-teal-950/20">
      <div className="flex items-start gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200"
          aria-hidden
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3c-4 4-7 7.5-7 11a7 7 0 1 0 14 0c0-3.5-3-7-7-11Z"
            />
          </svg>
        </span>
        <div>
          <h2 className="text-xl font-bold text-emerald-950 dark:text-emerald-100">ความยั่งยืน (ข้อมูลเดโม)</h2>
          <p className="mt-1 text-sm text-emerald-900/85 dark:text-emerald-200/90">
            สินค้านี้ถูกจัดให้ตรงกับแท็ก{" "}
            <span className="font-semibold tabular-nums">&ldquo;{label}&rdquo;</span> จากคำสำคัญในชื่อ หมวดหมู่ คำอธิบาย
            หรือแท็ก — ใช้จับคู่แบบตัวอย่างในเดโมเท่านั้น ไม่ใช่ใบรับรองจากบุคคลที่สาม
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-emerald-800/75 dark:text-emerald-300/80">
        หากนำไปใช้จริง ควรเชื่อมแหล่งข้อมูล มาตรฐาน (เช่น ใบรับรองออร์แกนิก หรือรายงานคาร์บอนฟุตพรินต์) และแสดงลิงก์อ้างอิงแยกตามข้อกฎหมายของแต่ละประเทศ
      </p>
    </section>
  );
}
