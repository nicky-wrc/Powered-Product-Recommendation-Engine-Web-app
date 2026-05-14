"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getToken, type OrderPublic } from "@/lib/api";
import { addProductToCart } from "@/lib/cartActions";
import { useAppModal } from "@/components/AppModalProvider";

type Props = { order: OrderPublic };

export function ReorderOrderButton({ order }: Props) {
  const router = useRouter();
  const { confirm } = useAppModal();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reorder() {
    const ok = await confirm({
      title: "สั่งซ้ำ",
      message: `เพิ่มสินค้าทั้งหมดจากออเดอร์ #${order.id.slice(0, 8)}… ลงตะกร้า (${order.items.length} รายการ)?`,
      confirmLabel: "เพิ่มลงตะกร้า",
      cancelLabel: "ยกเลิก",
    });
    if (!ok) return;
    const t = getToken();
    if (!t) return;
    setBusy(true);
    setMsg(null);
    try {
      for (const it of order.items) {
        const instFee = it.installation_service_fee ?? 0;
        const hasInst = !!(it.installation_service_label && it.installation_service_fee != null);
        const merchUnit = hasInst ? it.unit_price - instFee : it.unit_price;
        await addProductToCart(
          t,
          {
            id: it.product_id,
            name: it.product_name,
            price: merchUnit,
            image_url: null,
            installation_service_price: hasInst ? instFee : undefined,
          },
          it.quantity,
          {
            variantId: it.variant_id ?? null,
            ...(it.variant_label
              ? { lineName: `${it.product_name} — ${it.variant_label}` }
              : {}),
            linePrice: merchUnit,
            withInstallation: hasInst,
            installationSlotNote: it.installation_slot_note ?? null,
          },
        );
      }
      router.push("/cart");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not update cart");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void reorder()}
        className="self-start rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:opacity-60 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-100 dark:hover:bg-teal-900/40"
      >
        {busy ? "Adding…" : "Reorder"}
      </button>
      {msg ? <p className="text-xs text-red-600 dark:text-red-400">{msg}</p> : null}
    </div>
  );
}
