/**
 * Cross-tab "real-time": BroadcastChannel + same DOM events the app already listens to.
 * Each tab ignores its own messages so we do not double-trigger local handlers.
 */

function makeSync(channelName: string, domEventName: string) {
  const tabId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  let bc: BroadcastChannel | null = null;

  function subscribe(): void {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    if (bc) return;
    try {
      bc = new BroadcastChannel(channelName);
      bc.onmessage = (ev: MessageEvent<{ s?: string }>) => {
        if (ev.data?.s === tabId) return;
        window.dispatchEvent(new Event(domEventName));
      };
    } catch {
      /* ignore */
    }
  }

  function publish(): void {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    subscribe();
    try {
      bc?.postMessage({ s: tabId });
    } catch {
      /* ignore */
    }
  }

  return { subscribe, publish };
}

const cart = makeSync("recengine-cart-sync", "recengine-cart");
const wishlist = makeSync("recengine-wishlist-sync", "recengine-wishlist");
const compare = makeSync("recengine-compare-sync", "recengine-compare");

/** Call once at app root so other tabs can wake this tab. */
export function initTabCrossSync(): void {
  cart.subscribe();
  wishlist.subscribe();
  compare.subscribe();
}

export const tabPublish = {
  cart: () => cart.publish(),
  wishlist: () => wishlist.publish(),
  compare: () => compare.publish(),
};
