import { sustainabilityBadgeLabel } from "@/lib/sustainabilityBadge";
import type { Product } from "@/lib/api";

type Props = { product: Pick<Product, "tags" | "category" | "name" | "description">; className?: string };

export function SustainabilityBadge({ product, className = "" }: Props) {
  const label = sustainabilityBadgeLabel(product);
  if (!label) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 ${className}`}
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3c-4 4-7 7.5-7 11a7 7 0 1 0 14 0c0-3.5-3-7-7-11Z"
        />
      </svg>
      {label}
    </span>
  );
}
