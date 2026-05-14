import type { Product } from "@/lib/api";

type Props = { product: Product };

export function ProductVolumeTiersSection({ product }: Props) {
  const tiers = product.volume_tiers;
  if (!tiers?.length || product.is_gift_card) return null;

  return (
    <section
      aria-label="Quantity pricing"
      className="rounded-xl border border-teal-200/80 bg-teal-50/50 px-4 py-3 text-sm dark:border-teal-900/50 dark:bg-teal-950/25"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-900 dark:text-teal-200">
        ซื้อจำนวนมาก — ราคาต่อชิ้นลดลง
      </h2>
      <p className="mt-1 text-[11px] text-teal-950/80 dark:text-teal-200/70">
        ราคาต่อหน่วยใช้กับจำนวนรวมของรายการเดียวกัน (เช่น ตัวเลือกสีเดียวกัน) ในตะกร้า
      </p>
      <ul className="mt-2 space-y-1.5">
        {tiers.map((t) => (
          <li
            key={t.min_qty}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-teal-200/60 pb-1.5 last:border-0 last:pb-0 dark:border-teal-900/40"
          >
            <span className="text-stone-800 dark:text-stone-100">
              ซื้อ <span className="tabular-nums font-semibold">{t.min_qty}</span> ชิ้นขึ้นไป
            </span>
            <span className="font-semibold tabular-nums text-teal-800 dark:text-teal-300">
              ${t.unit_price.toFixed(2)} <span className="text-xs font-normal text-stone-600 dark:text-stone-400">/ ชิ้น</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
