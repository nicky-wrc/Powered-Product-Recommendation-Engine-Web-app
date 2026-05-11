"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { TagInput } from "@/components/TagInput";
import {
  adminCreateProduct,
  adminDeleteProduct,
  adminUpdateProduct,
  adminUploadProductImage,
  API_BASE,
  fetchProductCategories,
  fetchProducts,
  isLocalUploadImageUrl,
  productImageUrl,
  type Product,
} from "@/lib/api";
import Image from "next/image";

type Props = { token: string };

type FormDraft = {
  name: string;
  description: string;
  price: string;
  category: string;
  tags: string[];
  image_url: string;
  stock: string;
};

function tagsForApi(tags: string[]): string[] | null {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = raw.replace(/\s+/g, " ").trim().slice(0, 64);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 30) break;
  }
  return out.length ? out : null;
}

/** Resolve stored `/uploads/...` for <img> in the browser (proxy or direct API). */
function displayImageSrc(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/uploads/")) {
    const base = (typeof window !== "undefined" && !API_BASE ? window.location.origin : API_BASE || "").replace(
      /\/$/,
      "",
    );
    return `${base}${pathOrUrl}`;
  }
  return pathOrUrl;
}

const emptyDraft: FormDraft = {
  name: "",
  description: "",
  price: "",
  category: "",
  tags: [],
  image_url: "",
  stock: "",
};

/** Sentinel for inventory chip "ไม่มีหมวด" — not a real API category name */
const INV_FILTER_UNCATEGORIZED = "__uncategorized__" as const;

const INVENTORY_PAGE_SIZE = 25;

export function AdminProductManager({ token }: Props) {
  const createFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"create" | "edit" | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState(emptyDraft);
  const [form, setForm] = useState(emptyDraft);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  /** Inventory list filter: null = all; INV_FILTER_UNCATEGORIZED = empty category; else category name */
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string | null>(null);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      setDebouncedSearch((prev) => {
        if (prev !== next) setInventoryPage(1);
        return next;
      });
    }, 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const uncategorized = inventoryCategoryFilter === INV_FILTER_UNCATEGORIZED;
      const [r, cats] = await Promise.all([
        fetchProducts({
          page: inventoryPage,
          limit: INVENTORY_PAGE_SIZE,
          search: debouncedSearch || undefined,
          uncategorized: uncategorized || undefined,
          category: !uncategorized && inventoryCategoryFilter ? inventoryCategoryFilter : undefined,
        }),
        fetchProductCategories().catch(() => [] as string[]),
      ]);
      setProducts(r.products);
      setTotal(r.total);
      const tp = Math.max(1, r.total_pages);
      setTotalPages(tp);
      setCategoryOptions(cats);
      if (inventoryPage > tp) {
        setInventoryPage(tp);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดรายการสินค้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, inventoryCategoryFilter, inventoryPage]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchList();
    }, 0);
    return () => clearTimeout(id);
  }, [fetchList]);

  function startEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      category: p.category ?? "",
      tags: [...(p.tags ?? [])],
      image_url: p.image_url ?? "",
      stock: String(p.stock),
    });
    setMsg(null);
    setErr(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyDraft);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusyId("__create__");
    setMsg(null);
    setErr(null);
    try {
      const price = Number(createForm.price);
      const stock = createForm.stock === "" ? 0 : Number(createForm.stock);
      if (!createForm.name.trim()) throw new Error("กรุณากรอกชื่อสินค้า");
      if (!Number.isFinite(price) || price < 0) throw new Error("กรุณากรอกราคาให้ถูกต้อง");
      if (!Number.isFinite(stock) || stock < 0) throw new Error("กรุณากรอกจำนวนคงเหลือให้ถูกต้อง");
      await adminCreateProduct(token, {
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        price,
        category: createForm.category.trim() || null,
        tags: tagsForApi(createForm.tags),
        image_url: createForm.image_url.trim() || null,
        stock,
      });
      setCreateForm(emptyDraft);
      setMsg("สร้างสินค้าแล้ว");
      await fetchList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "สร้างสินค้าไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function submitUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setBusyId(editingId);
    setMsg(null);
    setErr(null);
    try {
      const price = form.price === "" ? undefined : Number(form.price);
      const stock = form.stock === "" ? undefined : Number(form.stock);
      if (!form.name.trim()) throw new Error("กรุณากรอกชื่อสินค้า");
      if (price !== undefined && (!Number.isFinite(price) || price < 0)) throw new Error("กรุณากรอกราคาให้ถูกต้อง");
      if (stock !== undefined && (!Number.isFinite(stock) || stock < 0)) throw new Error("กรุณากรอกจำนวนคงเหลือให้ถูกต้อง");
      await adminUpdateProduct(token, editingId, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        category: form.category.trim() || null,
        tags: tagsForApi(form.tags),
        image_url: form.image_url.trim() || null,
        stock,
      });
      setMsg("บันทึกการแก้ไขแล้ว");
      cancelEdit();
      await fetchList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(p: Product) {
    if (!window.confirm(`ลบสินค้า "${p.name}"?\nถ้าสินค้านี้อยู่ในคำสั่งซื้อ ระบบจะไม่ให้ลบ (409)`)) return;
    setBusyId(p.id);
    setMsg(null);
    setErr(null);
    try {
      await adminDeleteProduct(token, p.id);
      setMsg("ลบสินค้าแล้ว");
      if (editingId === p.id) cancelEdit();
      await fetchList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadSelectedFile(file: File | undefined, which: "create" | "edit") {
    if (!file) return;
    setUploading(which);
    setErr(null);
    try {
      const { url } = await adminUploadProductImage(token, file);
      if (which === "create") {
        setCreateForm((c) => ({ ...c, image_url: url }));
        if (createFileRef.current) createFileRef.current.value = "";
      } else {
        setForm((f) => ({ ...f, image_url: url }));
        if (editFileRef.current) editFileRef.current.value = "";
      }
      setMsg("อัปโหลดรูปแล้ว");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(null);
    }
  }

  const invRangeStart = total === 0 ? 0 : (inventoryPage - 1) * INVENTORY_PAGE_SIZE + 1;
  const invRangeEnd = Math.min(inventoryPage * INVENTORY_PAGE_SIZE, total);

  return (
    <div className="rounded-3xl border border-stone-200/90 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">แคตตาล็อก (แอดมิน)</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            เพิ่ม แก้ไข หรือลบสินค้า — ถ้าสินค้าถูกใช้ในคำสั่งซื้อแล้วจะลบไม่ได้ (HTTP 409)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="ค้นชื่อสินค้า…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="min-w-[12rem] rounded-xl border border-stone-200 bg-white/90 px-3 py-2 text-sm text-stone-900 shadow-inner outline-none ring-stone-900/5 placeholder:text-stone-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100"
          />
          <button
            type="button"
            onClick={() => void fetchList()}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 transition hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
          >
            รีเฟรช
          </button>
        </div>
      </div>

      {msg ? (
        <p className="mt-4 rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="mt-4 rounded-xl border border-rose-200/90 bg-rose-50/90 px-4 py-3 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">
          {err}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-10">
        <form
          onSubmit={submitCreate}
          className="w-full min-w-0 space-y-4 rounded-xl border border-stone-200/90 bg-gradient-to-b from-stone-50/90 to-stone-50/40 p-5 shadow-sm ring-1 ring-stone-200/30 dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-950/40 dark:ring-zinc-800/50"
        >
          <div className="space-y-0.5">
            <h3 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50 sm:text-[1.0625rem]">
              เพิ่มสินค้าใหม่
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">รูปและแท็กไม่บังคับ</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              ชื่อสินค้า
              <input
                required
                value={createForm.name}
                onChange={(e) => setCreateForm((d) => ({ ...d, name: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              รายละเอียด
              <textarea
                rows={2}
                value={createForm.description}
                onChange={(e) => setCreateForm((d) => ({ ...d, description: e.target.value }))}
                className="mt-1.5 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm leading-normal shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
              ราคา
              <input
                required
                inputMode="decimal"
                value={createForm.price}
                onChange={(e) => setCreateForm((d) => ({ ...d, price: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm tabular-nums shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
              คงเหลือ
              <input
                inputMode="numeric"
                value={createForm.stock}
                onChange={(e) => setCreateForm((d) => ({ ...d, stock: e.target.value }))}
                placeholder="0"
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm tabular-nums shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              หมวดหมู่ — เลือกจากรายการหรือพิมพ์ใหม่
              <input
                list="admin-category-datalist-create"
                value={createForm.category}
                onChange={(e) => setCreateForm((d) => ({ ...d, category: e.target.value }))}
                placeholder="เช่น Electronics หรือ I-PHONE"
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
              <datalist id="admin-category-datalist-create">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              แท็ก
              <div className="mt-1.5">
                <TagInput
                  value={createForm.tags}
                  onChange={(tags) => setCreateForm((d) => ({ ...d, tags }))}
                  disabled={busyId === "__create__" || uploading !== null}
                  placeholder="พิมพ์แท็ก แล้วกด Enter"
                  hint="เพิ่มทีละแท็กด้วย Enter หรือ comma — ลบด้วย × หรือ Backspace เมื่อช่องว่าง — วางหลายคำคั่นด้วย comma ได้ (สูงสุด 30 แท็ก)"
                />
              </div>
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              รูปสินค้า — เลือกไฟล์
              <input
                ref={createFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.svg,.ico,.heic,.heif"
                disabled={uploading !== null}
                onChange={(e) => void uploadSelectedFile(e.target.files?.[0], "create")}
                className="mt-1.5 block w-full text-xs text-stone-600 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-teal-600 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white file:shadow-sm hover:file:bg-teal-500 disabled:opacity-50 dark:text-stone-300"
              />
              <p className="mt-1 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                JPEG, PNG, WebP, GIF, AVIF, BMP, SVG, ICO, HEIC/HEIF — สูงสุด 5MB (รองรับไฟล์ที่ Windows ส่งมาเป็น octet-stream โดยอ่านจากนามสกุล/เนื้อไฟล์)
              </p>
            </label>
            {createForm.image_url ? (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400">ตัวอย่างรูป</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview for arbitrary URLs */}
                <img
                  src={displayImageSrc(createForm.image_url)}
                  alt=""
                  className="mt-1.5 h-24 max-w-full rounded-lg object-contain object-left ring-1 ring-stone-200 dark:ring-zinc-700"
                />
              </div>
            ) : null}
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              หรือใส่ URL รูปเอง (ไม่บังคับ)
              <input
                value={createForm.image_url}
                onChange={(e) => setCreateForm((d) => ({ ...d, image_url: e.target.value }))}
                placeholder="https://…"
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busyId === "__create__" || uploading !== null}
            className="w-full rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-600/20 transition hover:from-teal-500 hover:to-emerald-500 active:scale-[0.99] disabled:opacity-50"
          >
            {busyId === "__create__" ? "กำลังสร้าง…" : uploading === "create" ? "กำลังอัปโหลด…" : "เพิ่มสินค้า"}
          </button>
        </form>

        <section className="w-full min-h-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-50">สต็อกสินค้า</h3>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                {total} รายการที่ตรงกับตัวกรอง
                {inventoryCategoryFilter === INV_FILTER_UNCATEGORIZED
                  ? " · สินค้าไม่มีหมวด"
                  : inventoryCategoryFilter
                    ? ` · หมวด “${inventoryCategoryFilter}”`
                    : ""}
                {debouncedSearch ? ` · ค้น “${debouncedSearch}”` : ""}
              </p>
            </div>
            {loading ? <span className="text-sm text-stone-400">กำลังโหลด…</span> : null}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              กรองตามหมวด
            </p>
            <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto py-0.5 sm:max-h-none">
              <button
                type="button"
                onClick={() => {
                  setInventoryCategoryFilter(null);
                  setInventoryPage(1);
                }}
                className={`min-h-9 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  inventoryCategoryFilter === null
                    ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20"
                    : "border border-stone-200 bg-white text-stone-700 hover:border-teal-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:border-teal-700"
                }`}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => {
                  setInventoryCategoryFilter(INV_FILTER_UNCATEGORIZED);
                  setInventoryPage(1);
                }}
                className={`min-h-9 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  inventoryCategoryFilter === INV_FILTER_UNCATEGORIZED
                    ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20"
                    : "border border-stone-200 bg-white text-stone-700 hover:border-teal-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:border-teal-700"
                }`}
              >
                ไม่มีหมวด
              </button>
              {categoryOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setInventoryCategoryFilter(c);
                    setInventoryPage(1);
                  }}
                  className={`min-h-9 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                    inventoryCategoryFilter === c
                      ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20"
                      : "border border-stone-200 bg-white text-stone-700 hover:border-teal-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:border-teal-700"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-stone-500 dark:text-zinc-500">
              คลิกหมวดหรือ “ไม่มีหมวด” เพื่อโหลดเฉพาะกลุ่มนั้น (ใช้ร่วมกับช่องค้นหาด้านบนได้)
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-stone-200/80 bg-stone-100/40 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-stone-600 dark:text-stone-400 sm:text-sm">
              {total === 0 ? (
                "ไม่มีรายการในหน้านี้"
              ) : (
                <>
                  แสดง <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">{invRangeStart}</span>
                  –
                  <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">{invRangeEnd}</span>
                  {"จาก "}
                  <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">{total}</span>
                  {" รายการ · หน้า "}
                  <span className="tabular-nums">{inventoryPage}</span> / {totalPages}
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={loading || inventoryPage <= 1}
                onClick={() => setInventoryPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={loading || inventoryPage >= totalPages}
                onClick={() => setInventoryPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800"
              >
                ถัดไป
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-14rem)] min-h-[28rem] space-y-3 overflow-y-auto rounded-2xl border border-stone-200/90 bg-stone-50/40 p-3 shadow-inner dark:border-zinc-700 dark:bg-zinc-900/30 md:min-h-[32rem] md:p-4 lg:max-h-[calc(100vh-10rem)] lg:min-h-[36rem]">
            {products.map((p) => {
              const img = productImageUrl(p);
              return (
              <div
                key={p.id}
                className="rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90 md:p-5"
              >
                {editingId === p.id ? (
                  <form onSubmit={submitUpdate} className="space-y-4">
                    <p className="text-xs font-mono text-stone-400">{p.id}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base dark:border-zinc-600 dark:bg-zinc-950 sm:col-span-2"
                      />
                      <textarea
                        rows={3}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        className="resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950 sm:col-span-2"
                      />
                      <input
                        inputMode="decimal"
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                      />
                      <input
                        inputMode="numeric"
                        value={form.stock}
                        onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                      />
                      <div className="sm:col-span-2">
                        <input
                          list="admin-category-datalist-edit"
                          value={form.category}
                          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                          placeholder="หมวด — เลือกหรือพิมพ์ใหม่"
                          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        />
                        <datalist id="admin-category-datalist-edit">
                          {categoryOptions.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="mb-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">แท็ก</p>
                        <TagInput
                          value={form.tags}
                          onChange={(tags) => setForm((f) => ({ ...f, tags }))}
                          disabled={busyId === editingId || uploading !== null}
                          placeholder="แท็กใหม่ — Enter"
                          hint="Enter / comma เพิ่มแท็ก · วางข้อความหลายแท็กได้"
                        />
                      </div>
                      <label className="block text-[11px] font-medium text-stone-500 dark:text-stone-400 sm:col-span-2">
                        รูป — เลือกไฟล์ใหม่
                        <input
                          ref={editFileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.svg,.ico,.heic,.heif"
                          disabled={uploading !== null}
                          onChange={(e) => void uploadSelectedFile(e.target.files?.[0], "edit")}
                          className="mt-1 block w-full text-xs text-stone-600 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-600 file:px-3 file:py-1.5 file:font-semibold file:text-white hover:file:bg-teal-500 disabled:opacity-50 dark:text-stone-300"
                        />
                      </label>
                      {form.image_url ? (
                        <div className="sm:col-span-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={displayImageSrc(form.image_url)}
                            alt=""
                            className="h-20 max-w-full rounded-lg object-contain object-left ring-1 ring-stone-200 dark:ring-zinc-700"
                          />
                        </div>
                      ) : null}
                      <input
                        value={form.image_url}
                        onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                        placeholder="หรือ URL รูป"
                        className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950 sm:col-span-2"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busyId === editingId || uploading !== null}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-teal-600/20 hover:bg-teal-500 disabled:opacity-50"
                      >
                        {busyId === editingId ? "กำลังบันทึก…" : "บันทึก"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-stone-200 dark:hover:bg-zinc-800"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
                    <div className="relative mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200 dark:bg-zinc-900 dark:ring-zinc-700 sm:mx-0 sm:h-32 sm:w-32">
                      {img ? (
                        <Image
                          src={img}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="128px"
                          unoptimized={isLocalUploadImageUrl(p.image_url)}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-stone-400">
                          ไม่มีรูป
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/products/${p.id}`}
                            className="text-base font-bold text-teal-700 hover:underline md:text-lg dark:text-teal-400"
                          >
                            {p.name}
                          </Link>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {p.category ? (
                              <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-900 dark:bg-teal-950/80 dark:text-teal-200">
                                {p.category}
                              </span>
                            ) : (
                              <span className="rounded-full border border-dashed border-stone-300 px-3 py-1 text-xs text-stone-500 dark:border-zinc-600">
                                ไม่มีหมวด
                              </span>
                            )}
                            <span className="text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                              ${p.price.toFixed(2)}
                            </span>
                            <span className="text-sm text-stone-600 dark:text-stone-400">
                              คงเหลือ <strong className="text-stone-900 dark:text-stone-100">{p.stock}</strong>
                            </span>
                          </div>
                        </div>
                        <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            disabled={busyId !== null || uploading !== null}
                            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/50 active:scale-[0.99] disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:border-teal-700 dark:hover:bg-zinc-800 sm:w-auto"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(p)}
                            disabled={busyId !== null || uploading !== null}
                            className="rounded-md border border-rose-200 bg-rose-50/90 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 active:scale-[0.99] disabled:opacity-50 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950 sm:w-auto"
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
            })}
            {!loading && products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-base font-medium text-stone-600 dark:text-stone-400">ไม่พบสินค้าในตัวกรองนี้</p>
                <p className="mt-1 text-sm text-stone-500">ลองเลือก “ทั้งหมด” หรือเปลี่ยนคำค้น</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
