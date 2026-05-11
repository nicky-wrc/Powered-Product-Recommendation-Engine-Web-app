import type { Product } from "@/lib/api";

const STORAGE_KEY = "recengine_saved_for_later_v1";
const MAX_ITEMS = 50;

export const SAVED_FOR_LATER_CHANGED_EVENT = "recengine-saved-for-later";

export type SavedForLaterLine = {
  product_id: string;
  name: string;
  price: number;
  image_url: string | null;
  qty: number;
};

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

/** Park a cart line (full quantity) in “save for later”; dedupes by product_id and merges qty (cap 99). */
export function addToSavedForLater(line: SavedForLaterLine) {
  const qty = Math.max(1, Math.min(99, Math.floor(line.qty)));
  const list = getSavedForLater();
  const i = list.findIndex((x) => x.product_id === line.product_id);
  let next: SavedForLaterLine[];
  if (i >= 0) {
    const merged = Math.min(99, list[i].qty + qty);
    const rest = list.filter((_, j) => j !== i);
    next = [{ ...list[i], qty: merged, name: line.name, price: line.price, image_url: line.image_url }, ...rest];
  } else {
    next = [{ ...line, qty }, ...list].slice(0, MAX_ITEMS);
  }
  setSaved(next);
}

export function removeSavedForLater(productId: string) {
  setSaved(getSavedForLater().filter((x) => x.product_id !== productId));
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
