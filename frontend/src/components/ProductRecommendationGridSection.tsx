import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
};

/** กริดสินค้าแนะนำ — โครงการ์ดเดียวกับบล็อกอื่นบน PDP */
export function ProductRecommendationGridSection({ title, description, children }: Props) {
  return (
    <section className="space-y-5 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">{title}</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{description}</p>
      </div>
      {children}
    </section>
  );
}
