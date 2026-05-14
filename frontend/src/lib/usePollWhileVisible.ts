"use client";

import { useEffect, useRef } from "react";

/**
 * Re-fetch while the document is visible (tab active). Also runs on focus / visibility resume.
 * Use for soft "server real-time" without WebSockets.
 */
export function usePollWhileVisible(callback: () => void | Promise<void>, intervalMs: number, enabled: boolean): void {
  const cbRef = useRef(callback);

  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void Promise.resolve(cbRef.current());
    };
    void run();
    const id = window.setInterval(run, intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") void Promise.resolve(cbRef.current());
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, intervalMs]);
}
