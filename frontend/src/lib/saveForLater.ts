import type { Product } from "@/lib/api";

const STORAGE_KEY = "recengine_saved_for_later_v1";
const MAX_ITEMS = 50;

export const SAVED_FOR_LATER_CHANGED_EVENT = "recengine-saved-for-later";

export type SavedForLaterLine = {
  product_id: string;
  variant_id?: string | null;
  name: string;
  price: number;
  image_url: string | null;
  qty: number;
  with_installation?: boolean;
  installation_slot_note?: string | null;
  /** Per-unit add-on fee (merchandise unit = price − fee when with_installation). */
  installation_unit_fee?: number | null;
};

export function savedLineKey(line: Pick<SavedForLaterLine, "product_id" | "variant_id" | "with_installation">): string {
  return `${line.product_id}::${line.variant_id ?? ""}::${line.with_installation ? "1" : "0"}`;
}

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SAVED_FOR_LATER_CHANGED_EVENT));
}

export function getSavedForLater(): SavedForLaterLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is SavedForLaterLine =>
        row &&
        typeof row === "object" &&
        typeof (row as SavedForLaterLine).product_id === "string" &&
        typeof (row as SavedForLaterLine).name === "string" &&
        typeof (row as SavedForLaterLine).price === "number" &&
        typeof (row as SavedForLaterLine).qty === "number",
    );
  } catch {
    return [];
  }
}

function setSaved(lines: SavedForLaterLine[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  notify();
}

/** Park a cart line (full quantity) in “save for later”; dedupes by product + variant and merges qty (cap 99). */
export function addToSavedForLater(line: SavedForLaterLine) {
  const qty = Math.max(1, Math.min(99, Math.floor(line.qty)));
  const list = getSavedForLater();
  const k = savedLineKey(line);
  const i = list.findIndex((x) => savedLineKey(x) === k);
  let next: SavedForLaterLine[];
  if (i >= 0) {
    const merged = Math.min(99, list[i].qty + qty);
    const rest = list.filter((_, j) => j !== i);
    next = [
      {
        ...list[i],
        qty: merged,
        name: line.name,
        price: line.price,
        image_url: line.image_url,
        variant_id: line.variant_id ?? list[i].variant_id ?? null,
        with_installation: line.with_installation ?? list[i].with_installation,
        installation_slot_note: line.installation_slot_note ?? list[i].installation_slot_note ?? null,
        installation_unit_fee: line.installation_unit_fee ?? list[i].installation_unit_fee ?? null,
      },
      ...rest,
    ];
  } else {
    next = [{ ...line, qty }, ...list].slice(0, MAX_ITEMS);
  }
  setSaved(next);
}

export function removeSavedForLater(productId: string, variantId?: string | null, withInstallation = false) {
  const k = savedLineKey({ product_id: productId, variant_id: variantId ?? null, with_installation: withInstallation });
  setSaved(getSavedForLater().filter((x) => savedLineKey(x) !== k));
}

/** Reuse cart merge rules: add qty into active cart from a saved row shape. */
export function savedLineAsProduct(
  line: SavedForLaterLine,
): Pick<Product, "id" | "name" | "price" | "image_url"> & Partial<Pick<Product, "installation_service_price">> {
  const fee =
    line.with_installation && typeof line.installation_unit_fee === "number" ? line.installation_unit_fee : null;
  const merch = fee != null ? line.price - fee : line.price;
  return {
    id: line.product_id,
    name: line.name,
    price: merch,
    image_url: line.image_url,
    ...(line.with_installation && fee != null ? { installation_service_price: fee } : {}),
  };
}
