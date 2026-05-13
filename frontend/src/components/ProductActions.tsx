"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Product } from "@/lib/api";
import { getToken, postEvent } from "@/lib/api";
import { addProductToCart } from "@/lib/cartActions";
import { useAppModal } from "@/components/AppModalProvider";

type Props = { product: Product };

export function ProductActions({ product }: Props) {
  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const hasVariants = !!(product.has_variants && variants.length > 0);

  const [selectedId, setSelectedId] = useState<string>(() => variants[0]?.id ?? "");
  const { confirm } = useAppModal();
  const [msg, setMsg] = useState<string | null>(null);

  const effectiveId =
    variants.length === 0
      ? ""
      : variants.some((v) => v.id === selectedId)
        ? selectedId
        : (variants[0]?.id ?? "");

  const selected = variants.find((v) => v.id === effectiveId) ?? null;

  async function addToCart() {
    if (hasVariants && !selected) {
      setMsg("เลือกตัวเลือกสินค้าก่อนเพิ่มลงตะกร้า");
      return;
    }
    const label = selected ? `${product.name} — ${selected.label}` : product.name;
    const ok = await confirm({
      title: "เพิ่มลงตะกร้า",
      message: `เพิ่ม "${label}" จำนวน 1 ชิ้น ลงตะกร้า?`,
      confirmLabel: "เพิ่ม",
      cancelLabel: "ยกเลิก",
    });
    if (!ok) return;
    const t = getToken();
    setMsg(null);
    try {
      await addProductToCart(t, product, 1, {
        variantId: selected?.id ?? null,
        lineName: selected ? label : undefined,
        linePrice: selected?.price,
      });
      if (t) {
        await postEvent(t, {
          product_id: product.id,
          event_type: "add_to_cart",
          metadata: { quantity: 1, variant_id: selected?.id ?? null },
        });
      }
      setMsg("Added to cart — open Cart to review or checkout.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not update cart.");
    }
  }

  const variantOutOfStock = !!(selected && selected.stock <= 0);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-stone-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Signed-in: cart syncs to the server. Guests: items stay in this browser until you log in.
      </p>
      {hasVariants ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-stone-700 dark:text-stone-300">ตัวเลือกสินค้า</span>
          <select
            value={effectiveId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} — ${v.price.toFixed(2)}
                {v.stock <= 0 ? " (out of stock)" : v.stock <= 10 ? ` · ${v.stock} left` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={variantOutOfStock}
          onClick={() => void addToCart()}
          className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add to cart
        </button>
        <Link
          href="/cart"
          className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100 dark:hover:bg-zinc-900"
        >
          View cart
        </Link>
      </div>
      {variantOutOfStock ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">ตัวเลือกนี้หมดสต็อก — เลือกตัวอื่นหรือกลับมาใหม่ภายหลัง</p>
      ) : null}
      {msg ? <p className="text-sm text-stone-600 dark:text-stone-400">{msg}</p> : null}
    </div>
  );
}
