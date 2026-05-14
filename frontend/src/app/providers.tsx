"use client";

import { AppModalProvider } from "@/components/AppModalProvider";
import { initTabCrossSync } from "@/lib/tabCrossSync";
import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initTabCrossSync();
  }, []);
  return <AppModalProvider>{children}</AppModalProvider>;
}
