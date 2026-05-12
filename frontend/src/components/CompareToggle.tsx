"use client";

import { useEffect, useState } from "react";

import { useAppModal } from "@/components/AppModalProvider";

import type { Product } from "@/lib/api";
import {
  COMPARE_CHANGED_EVENT,
  compareCount,
  isInCompare,
  toggleCompare,
} from "@/lib/compare";

type Props = {
  product: Product;
  className?: string;
};

export function CompareToggle({ product, className = "" }: Props) {
  const [on, setOn] = useState(false);
  const { alert, confirm } = useAppModal();

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
          void (async () => {
            const inList = isInCompare(product.id);
            if (inList) {
              const ok = await confirm({
                title: "เอาออกจากเปรียบเทียบ",
                message: `เอา "${product.name}" ออกจากรายการเปรียบเทียบ?`,
                confirmLabel: "เอาออก",
                cancelLabel: "ยกเลิก",
                variant: "danger",
              });
              if (!ok) return;
              toggleCompare(product);
              setOn(false);
              return;
            }
            if (compareCount() >= 4) {
              void alert({
                title: "รายการเปรียบเทียบเต็ม",
                message: "เพิ่มได้สูงสุด 4 ชิ้น — ลบบางรายการที่หน้าเปรียบเทียบก่อน",
              });
              return;
            }
            const ok = await confirm({
              title: "เพิ่มลงเปรียบเทียบ",
              message: `เพิ่ม "${product.name}" ลงรายการเปรียบเทียบ?`,
              confirmLabel: "เพิ่ม",
              cancelLabel: "ยกเลิก",
            });
            if (!ok) return;
            const { inCompare: nextOn, atCapacity } = toggleCompare(product);
            if (atCapacity) {
              void alert({
                title: "รายการเปรียบเทียบเต็ม",
                message: "เพิ่มได้สูงสุด 4 ชิ้น — ลบบางรายการที่หน้าเปรียบเทียบก่อน",
              });
              return;
            }
            setOn(nextOn);
          })();
        }}
        className={`w-full rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
          on
            ? "border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-600 dark:bg-teal-950/50 dark:text-teal-100"
            : "border-stone-200 bg-white text-stone-800 hover:border-teal-300 hover:bg-teal-50/50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:border-teal-800"
        }`}
      >
        {on ? "✓ ในรายการเปรียบเทียบ" : "เปรียบเทียบ"}
      </button>
    </div>
  );
}
