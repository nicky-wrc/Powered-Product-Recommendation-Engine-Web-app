"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, startTransition } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { useAppModal } from "@/components/AppModalProvider";
import {
  addGiftRegistryItem,
  createGiftRegistry,
  deleteGiftRegistry,
  fetchGiftRegistryOwned,
  fetchMyGiftRegistries,
  fetchProduct,
  fetchProducts,
  formatNetworkError,
  getToken,
  isLocalUploadImageUrl,
  productImageUrl,
  removeGiftRegistryItem,
  updateGiftRegistry,
  type GiftRegistryDetail,
  type GiftRegistryItemPublic,
  type GiftRegistrySummary,
  type Product,
} from "@/lib/api";

function giftRegistryItemVariantLabel(it: GiftRegistryItemPublic): string | null {
  if (!it.variant_id) return null;
  return it.product.variants?.find((v) => v.id === it.variant_id)?.label ?? null;
}

export default function ManageGiftRegistriesPage() {
  const router = useRouter();
  const { confirm } = useAppModal();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [list, setList] = useState<GiftRegistrySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GiftRegistryDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEvent, setNewEvent] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editEvent, setEditEvent] = useState("");

  const [addProductId, setAddProductId] = useState("");
  const [addVariantId, setAddVariantId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addNote, setAddNote] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const [debouncedPicker, setDebouncedPicker] = useState("");
  const [pickerResults, setPickerResults] = useState<Product[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [pickerResolving, setPickerResolving] = useState(false);
  const pickerWrapRef = useRef<HTMLDivElement>(null);
  const pickerResultsRef = useRef<Product[]>([]);

  useEffect(() => {
    pickerResultsRef.current = pickerResults;
  }, [pickerResults]);

  const loadList = useCallback(async () => {
    const t = getToken();
    if (!t) return;
    setErr(null);
    const r = await fetchMyGiftRegistries(t);
    setList(r.registries);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const t = getToken();
    if (!t) return;
    setErr(null);
    const d = await fetchGiftRegistryOwned(t, id);
    setDetail(d);
    setEditTitle(d.title);
    setEditDesc(d.description ?? "");
    setEditEvent(d.event_date ?? "");
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      queueMicrotask(() => router.replace("/login?next=/gift-registries/manage"));
      return;
    }
    startTransition(() => {
      void (async () => {
        setLoading(true);
        try {
          await loadList();
        } catch (e) {
          setErr(formatNetworkError(e));
        } finally {
          setLoading(false);
        }
      })();
    });
  }, [loadList, router]);

  useEffect(() => {
    startTransition(() => {
      if (!selectedId) {
        setDetail(null);
        return;
      }
      void loadDetail(selectedId).catch((e) => setErr(formatNetworkError(e)));
    });
  }, [selectedId, loadDetail]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedPicker(pickerQuery.trim()), 300);
    return () => window.clearTimeout(id);
  }, [pickerQuery]);

  useEffect(() => {
    if (debouncedPicker.length < 2) {
      startTransition(() => {
        setPickerResults([]);
        setPickerLoading(false);
      });
      return;
    }
    let cancelled = false;
    startTransition(() => setPickerLoading(true));
    void (async () => {
      try {
        const r = await fetchProducts({ search: debouncedPicker, limit: 12, page: 1 });
        if (!cancelled) setPickerResults(r.products);
      } catch {
        if (!cancelled) setPickerResults([]);
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedPicker]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const el = pickerWrapRef.current;
      if (!el || pickerResultsRef.current.length === 0) return;
      const t = e.target;
      if (t instanceof Node && !el.contains(t)) setPickerResults([]);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || pickerResultsRef.current.length === 0) return;
      setPickerResults([]);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!copyToast) return;
    const t = window.setTimeout(() => setCopyToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [copyToast]);

  useEffect(() => {
    startTransition(() => {
      setAddProductId("");
      setAddVariantId("");
      setAddQty("1");
      setAddNote("");
      setPickerQuery("");
      setDebouncedPicker("");
      setPickerResults([]);
      setPickerProduct(null);
      setPickerResolving(false);
    });
  }, [selectedId]);

  const pickProduct = useCallback(async (p: Product) => {
    setPickerQuery(p.name);
    setAddProductId(p.id);
    setAddVariantId("");
    setPickerResults([]);
    setPickerProduct(null);
    setPickerResolving(true);
    setErr(null);
    try {
      const full = await fetchProduct(p.id);
      if (full?.product) {
        setPickerProduct(full.product);
        const vars = full.product.variants ?? [];
        if (!vars.length) setAddVariantId("");
      }
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setPickerResolving(false);
    }
  }, []);

  const clearPickedProduct = useCallback(() => {
    setPickerProduct(null);
    setAddProductId("");
    setAddVariantId("");
    setPickerQuery("");
    setPickerResults([]);
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const t = getToken();
    if (!t || !newTitle.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await createGiftRegistry(t, {
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        event_date: newEvent.trim() || null,
      });
      setNewTitle("");
      setNewDesc("");
      setNewEvent("");
      await loadList();
      setSelectedId(d.id);
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    const t = getToken();
    if (!t || !selectedId || !detail) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await updateGiftRegistry(t, selectedId, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        event_date: editEvent.trim() || null,
      });
      setDetail(d);
      await loadList();
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteRegistry() {
    const t = getToken();
    if (!t || !selectedId || !detail) return;
    const ok = await confirm({
      title: "ลบรายการของขวัญ",
      message: `ลบ "${detail.title}" และรายการสินค้าทั้งหมด?`,
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteGiftRegistry(t, selectedId);
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAddItem(e: React.FormEvent) {
    e.preventDefault();
    const t = getToken();
    if (!t || !selectedId) return;
    const pid = addProductId.trim();
    if (!pid) {
      setErr("เลือกสินค้าจากช่องค้นหา หรือกรอก Product ID ด้านล่าง");
      return;
    }
    const variants = pickerProduct?.variants ?? [];
    if (variants.length > 0 && !addVariantId.trim()) {
      setErr("สินค้านี้มีตัวเลือก — กรุณาเลือก variant");
      return;
    }
    const q = Math.trunc(Number(addQty));
    if (!Number.isFinite(q) || q < 1) {
      setErr("จำนวนต้องเป็นตัวเลข ≥ 1");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const d = await addGiftRegistryItem(t, selectedId, {
        product_id: pid,
        variant_id: addVariantId.trim() || null,
        quantity_requested: q,
        note: addNote.trim() || null,
      });
      setDetail(d);
      setAddProductId("");
      setAddVariantId("");
      setAddQty("1");
      setAddNote("");
      setPickerQuery("");
      setPickerProduct(null);
      setPickerResults([]);
      await loadList();
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveItem(itemId: string) {
    const t = getToken();
    if (!t || !selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await removeGiftRegistryItem(t, selectedId, itemId);
      setDetail(d);
      await loadList();
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyShareUrl() {
    if (!detail || typeof window === "undefined") return;
    const url = `${window.location.origin}/gift-registry/${encodeURIComponent(detail.slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyToast("คัดลอกลิงก์แชร์แล้ว");
    } catch {
      setCopyToast("คัดลอกไม่สำเร็จ — ลองคัดลอกด้วยตนเอง");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <p className="text-sm text-stone-500">กำลังโหลด…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">รายการของขวัญ (Gift registry)</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            สร้างลิสต์ แชร์ลิงก์ให้เพื่อนซื้อตามรายการ — ค้นหาสินค้าชื่อสินค้า หรือกรอก UUID เองถ้าต้องการ
          </p>
          <p className="mt-2 text-sm">
            <Link href="/profile" className="font-semibold text-teal-700 underline dark:text-teal-400">
              ← กลับโปรไฟล์
            </Link>
          </p>
        </div>

        {err ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </div>
        ) : null}

        <section className="rounded-2xl border border-stone-200/90 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/80">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-50">สร้างลิสต์ใหม่</h2>
          <form onSubmit={(e) => void onCreate(e)} className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
              ชื่อลิสต์
              <input
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
              คำอธิบาย (ไม่บังคับ)
              <textarea
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
              วันงาน (YYYY-MM-DD — ไม่บังคับ)
              <input
                type="date"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                className="mt-1 w-full max-w-xs rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              สร้าง
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-stone-200/90 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/80">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-50">ลิสต์ของฉัน</h2>
          {list.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">ยังไม่มีลิสต์</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {list.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                      selectedId === r.id
                        ? "border-teal-500 bg-teal-50/80 dark:border-teal-600 dark:bg-teal-950/30"
                        : "border-stone-200 hover:border-stone-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                    }`}
                  >
                    <span className="font-semibold text-stone-900 dark:text-stone-50">{r.title}</span>
                    <span className="ml-2 text-stone-500 tabular-nums dark:text-stone-400">
                      · {r.item_count} รายการ · /gift-registry/{r.slug}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {detail ? (
          <section className="space-y-4 rounded-2xl border border-stone-200/90 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-50">แก้ไขลิสต์</h2>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/gift-registry/${encodeURIComponent(detail.slug)}`}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:text-stone-100 dark:hover:bg-zinc-900"
                >
                  เปิดหน้าแชร์
                </Link>
                <button
                  type="button"
                  onClick={() => void copyShareUrl()}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:text-stone-100 dark:hover:bg-zinc-900"
                >
                  Copy ลิงก์
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteRegistry()}
                  disabled={busy}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                >
                  ลบลิสต์
                </button>
              </div>
            </div>
            <form onSubmit={(e) => void onSaveMeta(e)} className="space-y-3">
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                ชื่อ
                <input
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                คำอธิบาย
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                วันงาน
                <input
                  type="date"
                  value={editEvent}
                  onChange={(e) => setEditEvent(e.target.value)}
                  className="mt-1 w-full max-w-xs rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
              >
                บันทึกข้อมูลหัวลิสต์
              </button>
            </form>

            <div className="border-t border-stone-200 pt-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">เพิ่มสินค้า</h3>
              <form onSubmit={(e) => void onAddItem(e)} className="mt-3 grid gap-3 sm:grid-cols-2">
                <div ref={pickerWrapRef} className="relative sm:col-span-2">
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                    ค้นหาสินค้า (พิมพ์อย่างน้อย 2 ตัวอักษร)
                    <input
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder="เช่น หูฟัง, กาแฟ, …"
                      autoComplete="off"
                      className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                  {pickerLoading || pickerResolving ? (
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">กำลังโหลด…</p>
                  ) : null}
                  {pickerResults.length > 0 ? (
                    <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
                      {pickerResults.map((p) => {
                        const thumb = productImageUrl(p);
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => void pickProduct(p)}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-zinc-900"
                            >
                              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-zinc-900">
                                {thumb ? (
                                  <Image
                                    src={thumb}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="48px"
                                    unoptimized={isLocalUploadImageUrl(p.image_url)}
                                  />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 font-medium text-stone-900 dark:text-stone-50">{p.name}</span>
                                <span className="mt-0.5 block text-xs tabular-nums text-stone-500 dark:text-stone-400">
                                  ${p.price.toFixed(2)}
                                  {p.has_variants ? " · มีตัวเลือก" : ""}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>

                {pickerProduct || addProductId ? (
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <span className="text-xs text-stone-600 dark:text-stone-400">
                      เลือกแล้ว:{" "}
                      <span className="font-medium text-stone-900 dark:text-stone-50">
                        {pickerProduct?.name ??
                          (pickerQuery.trim() || (addProductId ? `รหัส ${addProductId.slice(0, 8)}…` : ""))}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => clearPickedProduct()}
                      className="text-xs font-semibold text-teal-800 hover:underline dark:text-teal-400"
                    >
                      ล้าง
                    </button>
                  </div>
                ) : null}

                {(pickerProduct?.variants ?? []).length > 0 ? (
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
                    ตัวเลือก (variant)
                    <select
                      value={addVariantId}
                      onChange={(e) => setAddVariantId(e.target.value)}
                      required
                      className="mt-1 w-full max-w-md rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="">— เลือก —</option>
                      {(pickerProduct?.variants ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} · ${v.price.toFixed(2)} · สต็อก {v.stock}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <details className="sm:col-span-2">
                  <summary className="cursor-pointer text-xs font-medium text-stone-600 underline-offset-2 hover:underline dark:text-stone-400">
                    กรอก Product / Variant UUID เอง
                  </summary>
                  <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3 dark:border-zinc-800">
                    <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                      Product ID (UUID)
                      <input
                        value={addProductId}
                        onChange={(e) => {
                          setAddProductId(e.target.value);
                          setPickerProduct(null);
                          setPickerQuery("");
                        }}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </label>
                    <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                      Variant ID (ถ้ามีตัวเลือก)
                      <input
                        value={addVariantId}
                        onChange={(e) => setAddVariantId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </label>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      ถ้ากรอก UUID เองและสินค้ามี variant ต้องใส่ Variant ID ให้ตรงกับสินค้านั้น
                    </p>
                  </div>
                </details>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                  จำนวนที่อยากได้
                  <input
                    inputMode="numeric"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
                  หมายเหตุ (ไม่บังคับ)
                  <input
                    value={addNote}
                    onChange={(e) => setAddNote(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50 sm:col-span-2 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  เพิ่มสินค้าลงลิสต์
                </button>
              </form>
            </div>

            <div className="border-t border-stone-200 pt-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">รายการสินค้า</h3>
              {detail.items.length === 0 ? (
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">ยังว่าง</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200/90 px-3 py-2 text-sm dark:border-zinc-800"
                    >
                      <div>
                        <Link
                          href={`/products/${it.product_id}`}
                          className="font-medium text-teal-800 hover:underline dark:text-teal-300"
                        >
                          {it.product.name}
                        </Link>
                        <span className="ml-2 text-stone-500 tabular-nums dark:text-stone-400">
                          ×{it.quantity_requested}
                          {it.variant_id
                            ? ` · ${giftRegistryItemVariantLabel(it) ?? `variant ${it.variant_id.slice(0, 8)}…`}`
                            : ""}
                        </span>
                        {it.note ? <p className="text-xs text-stone-600 dark:text-stone-400">{it.note}</p> : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onRemoveItem(it.id)}
                        className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50 dark:text-rose-400"
                      >
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}
      </main>
      {copyToast ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 max-w-[min(90vw,24rem)] -translate-x-1/2 rounded-full border border-stone-200 bg-stone-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg dark:border-zinc-600 dark:bg-zinc-950"
        >
          {copyToast}
        </div>
      ) : null}
    </div>
  );
}
