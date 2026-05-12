import { getVideoEmbedInfo } from "@/lib/videoEmbed";

type Props = { productName: string; videoUrl: string | null | undefined };

export function ProductMediaSpotlightSection({ productName, videoUrl }: Props) {
  const trimmed = (videoUrl ?? "").trim();
  if (!trimmed) return null;

  let normalizedWatch = trimmed;
  try {
    normalizedWatch = /\w+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    new URL(normalizedWatch);
  } catch {
    return null;
  }

  const embed = getVideoEmbedInfo(trimmed);

  return (
    <section className="space-y-5 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">วิดีโอสินค้า</h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">ดู “{productName}” แบบเคลื่อนไหว — ฝังจากแหล่งที่รองรับ</p>
        </div>
        <a
          href={normalizedWatch}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sm font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
        >
          เปิดในแท็บใหม่
        </a>
      </div>

      {embed ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-black shadow-lg ring-1 ring-stone-900/10 dark:border-zinc-700 dark:ring-white/10">
          <div className="relative aspect-video w-full">
            <iframe
              title={`วิดีโอ: ${productName}`}
              src={embed.src}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">ลิงก์นี้ยังฝังเป็นตัวเล่นไม่ได้อัตโนมัติ</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            ใช้ URL หน้ารับชมของ <strong className="font-semibold">YouTube</strong> หรือ{" "}
            <strong className="font-semibold">Vimeo</strong> เช่น{" "}
            <code className="rounded bg-white/80 px-1 text-xs dark:bg-zinc-900">youtube.com/watch?…</code>,{" "}
            <code className="rounded bg-white/80 px-1 text-xs dark:bg-zinc-900">youtu.be/…</code>,{" "}
            <code className="rounded bg-white/80 px-1 text-xs dark:bg-zinc-900">vimeo.com/…</code>
          </p>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-500">
        การเล่นวิดีโออยู่ภายใต้นโยบายและคุกกี้ของผู้ให้บริการ (เช่น YouTube / Vimeo) — แนะนำให้เพิ่มคำอธิบายข้อความหรือคำบรรยายในแหล่งวิดีโอเพื่อการเข้าถึง
      </p>
    </section>
  );
}
