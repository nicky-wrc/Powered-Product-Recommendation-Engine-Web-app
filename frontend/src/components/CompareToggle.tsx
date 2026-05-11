"use client";

import { useEffect, useState } from "react";

import type { Product } from "@/lib/api";
import {
  COMPARE_CHANGED_EVENT,
  isInCompare,
  toggleCompare,
} from "@/lib/compare";

type Props = {
  product: Product;
  className?: string;
};

export function CompareToggle({ product, className = "" }: Props) {
  const [on, setOn] = useState(false);
  const [capacityMsg, setCapacityMsg] = useState(false);

  useEffect(() => {
    const sync = () => setOn(isInCompare(product.id));
    sync();
    window.addEventListener(COMPARE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COMPARE_CHANGED_EVENT, sync);
  }, [product.id]);

  return (
    <div className={className}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? "Remove from compare" : "Add to compare"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setCapacityMsg(false);
          const { inCompare: next, atCapacity } = toggleCompare(product);
          if (atCapacity) {
            setCapacityMsg(true);
            window.setTimeout(() => setCapacityMsg(false), 3200);
            return;
          }
          setOn(next);
        }}
        className={`w-full rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
          on
            ? "border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-600 dark:bg-teal-950/50 dark:text-teal-100"
            : "border-stone-200 bg-white text-stone-800 hover:border-teal-300 hover:bg-teal-50/50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:border-teal-800"
        }`}
      >
        {on ? "✓ ในรายการเปรียบเทียบ" : "เปรียบเทียบ"}
      </button>
      {capacityMsg ? (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          เพิ่มได้สูงสุด 4 ชิ้น — ลบบางรายการที่หน้าเปรียบเทียบก่อน
        </p>
      ) : null}
    </div>
  );
}
