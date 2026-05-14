"use client";

import Image from "next/image";

import { isLocalUploadImageUrl, type Product } from "@/lib/api";

type AMod = NonNullable<Product["a_plus_modules"]>[number];

function moduleImageSrc(productId: string, u: string | null | undefined): string | null {
  if (!u?.trim()) return null;
  const s = u.trim();
  if (/unsplash\.com/i.test(s)) {
    return `https://picsum.photos/seed/apl-${productId.replace(/-/g, "")}-${String(s.length)}/1000/560`;
  }
  return s;
}

export function ProductAPlusSection({ product }: { product: Product }) {
  const modules = product.a_plus_modules;
  if (!modules?.length) return null;

  return (
    <section
      className="rounded-3xl border border-stone-200/90 bg-gradient-to-b from-stone-50/90 to-white/80 p-6 shadow-sm ring-1 ring-stone-900/[0.03] dark:border-zinc-800 dark:from-zinc-950/80 dark:to-zinc-950/40 md:p-8"
      aria-labelledby="a-plus-heading"
    >
      <h2 id="a-plus-heading" className="text-lg font-bold text-stone-900 dark:text-stone-50">
        จากแบรนด์
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">รายละเอียดแบบ A+ — โมดูลจากผู้ดูแลร้าน</p>
      <div className="mt-8 space-y-12">
        {modules.map((raw, idx) => {
          const m = raw as AMod & {
            type?: string;
            headline?: string;
            title?: string;
            body?: string | null;
            image_url?: string | null;
            image_align?: string;
            items?: string[];
          };
          const t = m.type;
          if (t === "banner") {
            const src = moduleImageSrc(product.id, m.image_url);
            return (
              <article key={`a-plus-${idx}`} className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white/90 dark:border-zinc-800 dark:bg-zinc-950/80">
                {src ? (
                  <div className="relative aspect-[21/9] w-full bg-stone-100 dark:bg-zinc-900">
                    <Image
                      src={src}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 1152px) 100vw, 1152px"
                      unoptimized={isLocalUploadImageUrl(m.image_url ?? null)}
                    />
                  </div>
                ) : null}
                <div className="space-y-2 p-5 md:p-6">
                  <h3 className="text-xl font-bold text-stone-900 dark:text-stone-50">{m.headline ?? "Highlight"}</h3>
                  {m.body ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-600 dark:text-stone-400">{m.body}</p>
                  ) : null}
                </div>
              </article>
            );
          }
          if (t === "feature_list") {
            const items = (m.items ?? []).filter((x) => typeof x === "string" && x.trim());
            if (items.length === 0) return null;
            return (
              <article key={`a-plus-${idx}`} className="rounded-2xl border border-stone-200/80 bg-white/90 px-5 py-6 dark:border-zinc-800 dark:bg-zinc-950/80 md:px-8">
                {m.title ? (
                  <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">{m.title}</h3>
                ) : (
                  <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">จุดเด่น</h3>
                )}
                <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-stone-700 dark:text-stone-300">
                  {items.map((it, j) => (
                    <li key={`${idx}-${j}`}>{it}</li>
                  ))}
                </ul>
              </article>
            );
          }
          if (t === "image_text") {
            const src = moduleImageSrc(product.id, m.image_url);
            const alignRight = m.image_align === "right";
            return (
              <article
                key={`a-plus-${idx}`}
                className="flex flex-col gap-5 rounded-2xl border border-stone-200/80 bg-white/90 p-4 dark:border-zinc-800 dark:bg-zinc-950/80 md:flex-row md:items-center md:gap-8 md:p-6"
              >
                {src ? (
                  <div
                    className={`relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-stone-100 dark:bg-zinc-900 md:aspect-[4/3] md:w-[min(100%,420px)] ${
                      alignRight ? "md:order-2" : "md:order-1"
                    }`}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 420px"
                      unoptimized={isLocalUploadImageUrl(m.image_url ?? null)}
                    />
                  </div>
                ) : null}
                <div className={`min-w-0 flex-1 space-y-2 ${alignRight ? "md:order-1" : "md:order-2"}`}>
                  {m.title ? (
                    <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">{m.title}</h3>
                  ) : null}
                  {m.body ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-600 dark:text-stone-400">{m.body}</p>
                  ) : null}
                </div>
              </article>
            );
          }
          return null;
        })}
      </div>
    </section>
  );
}
