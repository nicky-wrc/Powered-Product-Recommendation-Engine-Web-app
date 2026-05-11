"use client";

import { useCallback, useRef, useState } from "react";

const MAX_TAG_LEN = 64;
const MAX_TAGS = 30;

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
};

function normalizeIncoming(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LEN);
}

function splitPaste(blob: string): string[] {
  return blob
    .split(/[\n,;，]+/)
    .map((s) => normalizeIncoming(s))
    .filter(Boolean);
}

export function TagInput({ value, onChange, placeholder, disabled, hint }: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(
    (text: string) => {
      const t = normalizeIncoming(text);
      if (!t) return;
      if (value.length >= MAX_TAGS) return;
      const lower = t.toLowerCase();
      if (value.some((x) => x.toLowerCase() === lower)) {
        setDraft("");
        return;
      }
      onChange([...value, t]);
      setDraft("");
    },
    [value, onChange],
  );

  const removeAt = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "，") {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === "Backspace" && !draft && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData("text");
    if (!t.includes("\n") && !t.includes(",") && !t.includes("，") && !t.includes(";")) return;
    e.preventDefault();
    const parts = splitPaste(t);
    if (parts.length === 0) return;
    const seen = new Set(value.map((x) => x.toLowerCase()));
    const next = [...value];
    for (const p of parts) {
      if (next.length >= MAX_TAGS) break;
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      next.push(p);
    }
    onChange(next);
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      <div
        className={`flex min-h-[2.75rem] flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-2 py-2 shadow-inner transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 ${
          disabled ? "pointer-events-none opacity-60" : ""
        }`}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          inputRef.current?.focus();
        }}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-teal-200/80 bg-gradient-to-r from-teal-50 to-emerald-50 pl-2.5 pr-1 text-xs font-medium text-teal-900 shadow-sm dark:border-teal-800 dark:from-teal-950/80 dark:to-emerald-950/60 dark:text-teal-100"
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeAt(i)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-teal-700/80 transition hover:bg-teal-200/70 hover:text-teal-900 dark:text-teal-200 dark:hover:bg-teal-800/80"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_TAG_LEN))}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => commit(draft)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-zinc-500"
        />
      </div>
      {hint ? <p className="text-[11px] leading-snug text-stone-500 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}
