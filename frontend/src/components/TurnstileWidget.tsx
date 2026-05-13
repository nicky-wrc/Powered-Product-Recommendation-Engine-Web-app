"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
};

export function TurnstileWidget({ siteKey, onToken }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !hostRef.current) return;
    let cancelled = false;

    const mount = () => {
      if (cancelled || !hostRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        callback: (t: string) => onTokenRef.current(t),
        "error-callback": () => onTokenRef.current(null),
        "expired-callback": () => onTokenRef.current(null),
      });
    };

    if (window.turnstile) {
      mount();
    } else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (!s) {
        s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.addEventListener("load", mount);
        document.head.appendChild(s);
      } else if (window.turnstile) {
        mount();
      } else {
        s.addEventListener("load", mount);
      }
    }

    return () => {
      cancelled = true;
      const wid = widgetIdRef.current;
      widgetIdRef.current = null;
      if (wid && window.turnstile) {
        try {
          window.turnstile.remove(wid);
        } catch {
          /* ignore */
        }
      }
    };
  }, [siteKey]);

  return <div ref={hostRef} className="min-h-[65px]" />;
}
