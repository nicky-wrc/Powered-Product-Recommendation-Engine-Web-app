import type { Product } from "@/lib/api";

const STORAGE_KEY = "recengine_stock_alerts_v1";
const MAX_ITEMS = 80;

export const STOCK_ALERTS_CHANGED_EVENT = "recengine-stock-alerts";

export type StockAlertEntry = {
  product_id: string;
  name: string;
};

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STOCK_ALERTS_CHANGED_EVENT));
}

export function getStockAlerts(): StockAlertEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is StockAlertEntry =>
        row &&
        typeof row === "object" &&
        typeof (row as StockAlertEntry).product_id === "string" &&
        typeof (row as StockAlertEntry).name === "string",
    );
  } catch {
    return [];
  }
}

function setList(entries: StockAlertEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)));
  notify();
}

export function stockAlertCount(): number {
  return getStockAlerts().length;
}

export function isStockAlertSet(productId: string): boolean {
  return getStockAlerts().some((x) => x.product_id === productId);
}

export function addStockAlert(p: Pick<Product, "id" | "name">) {
  const list = getStockAlerts().filter((x) => x.product_id !== p.id);
  setList([{ product_id: p.id, name: p.name }, ...list].slice(0, MAX_ITEMS));
}

export function removeStockAlert(productId: string) {
  setList(getStockAlerts().filter((x) => x.product_id !== productId));
}

/** Returns true if now watching (subscribed). */
export function toggleStockAlert(p: Pick<Product, "id" | "name">): boolean {
  if (isStockAlertSet(p.id)) {
    removeStockAlert(p.id);
    return false;
  }
  addStockAlert(p);
  return true;
}

export function clearStockAlerts() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  notify();
}
