"use client";

import { AppModalProvider } from "@/components/AppModalProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AppModalProvider>{children}</AppModalProvider>;
}
