const STORAGE_KEY = "recengine_notify_prefs_v1";

export const NOTIFICATION_PREFS_CHANGED_EVENT = "recengine-notify-prefs";

export type NotificationPrefs = {
  email_order_updates: boolean;
  email_promotions: boolean;
  email_stock_alerts: boolean;
  email_product_recommendations: boolean;
};

const DEFAULTS: NotificationPrefs = {
  email_order_updates: true,
  email_promotions: true,
  email_stock_alerts: true,
  email_product_recommendations: true,
};

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATION_PREFS_CHANGED_EVENT));
}

export function getNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      email_order_updates: typeof data.email_order_updates === "boolean" ? data.email_order_updates : DEFAULTS.email_order_updates,
      email_promotions: typeof data.email_promotions === "boolean" ? data.email_promotions : DEFAULTS.email_promotions,
      email_stock_alerts: typeof data.email_stock_alerts === "boolean" ? data.email_stock_alerts : DEFAULTS.email_stock_alerts,
      email_product_recommendations:
        typeof data.email_product_recommendations === "boolean"
          ? data.email_product_recommendations
          : DEFAULTS.email_product_recommendations,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setNotificationPrefs(prefs: NotificationPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  notify();
}

export function updateNotificationPref<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
  const next = { ...getNotificationPrefs(), [key]: value };
  setNotificationPrefs(next);
}

export function defaultNotificationPrefs(): NotificationPrefs {
  return { ...DEFAULTS };
}

/** For features like stock alerts — returns whether user opted in (demo: local only). */
export function wantsStockAlertEmails(): boolean {
  return getNotificationPrefs().email_stock_alerts;
}
