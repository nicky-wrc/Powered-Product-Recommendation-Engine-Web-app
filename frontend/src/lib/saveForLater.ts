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
};

export function savedLineKey(line: Pick<SavedForLaterLine, "product_id" | "variant_id">): string {
  return `${line.product_id}::${line.variant_id ?? ""}`;
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
      },
      ...rest,
    ];
  } else {
    next = [{ ...line, qty }, ...list].slice(0, MAX_ITEMS);
  }
  setSaved(next);
}

export function removeSavedForLater(productId: string, variantId?: string | null) {
  const k = savedLineKey({ product_id: productId, variant_id: variantId ?? null });
  setSaved(getSavedForLater().filter((x) => savedLineKey(x) !== k));
}

/** Reuse cart merge rules: add qty into active cart from a saved row shape. */
export function savedLineAsProduct(
  line: SavedForLaterLine,
): Pick<Product, "id" | "name" | "price" | "image_url"> {
  return {
    id: line.product_id,
    name: line.name,
    price: line.price,
    image_url: line.image_url,
  };
}
