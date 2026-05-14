"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { TagInput } from "@/components/TagInput";
import { useAppModal } from "@/components/AppModalProvider";
import {
  adminAddProductGalleryImage,
  adminCreateProduct,
  adminDeleteProduct,
  adminDeleteProductGalleryImage,
  adminGetProductDetail,
  adminReorderProductGallery,
  adminUpdateProduct,
  adminUploadProductImage,
  API_BASE,
  fetchProductCategories,
  fetchProducts,
  isLocalUploadImageUrl,
  productImageUrl,
  type Product,
  type ProductGalleryRow,
  type AdminProductVariantUpsert,
} from "@/lib/api";
import Image from "next/image";

type Props = { token: string; mode: "create" | "inventory" };

type FormDraft = {
  name: string;
  description: string;
  price: string;
  sale_price: string;
  sale_ends_at: string;
  category: string;
  brand: string;
  tags: string[];
  image_url: string;
  video_url: string;
  stock: string;
  product_code: string;
  meta_title: string;
  meta_description: string;
  a_plus_json: string;
  is_hazardous: boolean;
  minimum_age: string;
  compliance_note: string;
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

function parseAPlusModulesJson(raw: string): Record<string, unknown>[] | null {
  const t = raw.trim();
  if (!t) return null;
  let data: unknown;
  try {
    data = JSON.parse(t);
  } catch {
    throw new Error("เนื้อหา A+ ไม่ใช่ JSON ที่อ่านได้");
  }
  if (!Array.isArray(data)) throw new Error("เนื้อหา A+ ต้องเป็น JSON array");
  return data as Record<string, unknown>[];
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Empty: no flash. Incomplete: one field set — invalid. Otherwise payload for API. */
function flashPayloadFromForm(salePriceStr: string, saleEndsLocal: string):
  | { sale_price?: number | null; sale_ends_at?: string | null }
  | "empty"
  | "incomplete" {
  const spTrim = salePriceStr.trim();
  const endsTrim = saleEndsLocal.trim();
  if (!spTrim && !endsTrim) return "empty";
  if (!spTrim || !endsTrim) return "incomplete";
  const sp = Number(spTrim);
  if (!Number.isFinite(sp) || sp < 0) throw new Error("ราคา Flash deal ไม่ถูกต้อง");
  const iso = new Date(endsTrim);
  if (Number.isNaN(iso.getTime())) throw new Error("วัน-เวลาหมด Flash deal ไม่ถูกต้อง");
  return { sale_price: sp, sale_ends_at: iso.toISOString() };
}

function parseMinimumAge(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Math.trunc(Number(t));
  if (!Number.isFinite(n) || n < 1 || n > 99) {
    throw new Error("อายุขั้นต่ำต้องเป็นจำนวนเต็ม 1–99 หรือว่าง");
  }
  return n;
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
  sale_price: "",
  sale_ends_at: "",
  category: "",
  brand: "",
  tags: [],
  image_url: "",
  video_url: "",
  stock: "",
  product_code: "",
  meta_title: "",
  meta_description: "",
  a_plus_json: "",
  is_hazardous: false,
  minimum_age: "",
  compliance_note: "",
};

/** Sentinel for inventory chip "ไม่มีหมวด" — not a real API category name */
const INV_FILTER_UNCATEGORIZED = "__uncategorized__" as const;

const INVENTORY_PAGE_SIZE = 25;

type CreatePendingImage = { key: string; url: string };

type VariantDraftRow = { key: string; serverId?: string; label: string; price: string; stock: string };

function variantUpsertsFromDraft(rows: VariantDraftRow[]): AdminProductVariantUpsert[] {
  const variantParsed = rows
    .map((r) => {
      const label = r.label.trim();
      const price = Number(r.price);
      const stock = Math.trunc(Number(r.stock));
      return { serverId: r.serverId, label, price, stock };
    })
    .filter((r) => r.label.length > 0);

  for (const r of variantParsed) {
    if (!Number.isFinite(r.price) || r.price < 0) throw new Error("ราคา variant ไม่ถูกต้อง");
    if (!Number.isFinite(r.stock) || r.stock < 0) throw new Error("จำนวน variant ไม่ถูกต้อง");
  }

  return variantParsed.map((r, i) => ({
    ...(r.serverId ? { id: r.serverId } : {}),
    label: r.label,
    price: r.price,
    stock: r.stock,
    sort_order: i,
  }));
}

function newCreateImageKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function AdminProductManager({ token, mode }: Props) {
  const { confirm } = useAppModal();
  const createFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const editDetailForIdRef = useRef<string | null>(null);
  const editAPlusJsonBaselineRef = useRef("");
  const [uploading, setUploading] = useState<"create" | "edit" | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(mode === "inventory");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState(emptyDraft);
  /** รูปที่จะผูกกับสินค้าใหม่ (เรียงลำดับ = แกลเลอรี่; รูปแรก = ปก) — ก่อนกดสร้างสินค้า */
  const [createGallery, setCreateGallery] = useState<CreatePendingImage[]>([]);
  const [createVariants, setCreateVariants] = useState<VariantDraftRow[]>([]);
  const [createUrlDraft, setCreateUrlDraft] = useState("");
  const [form, setForm] = useState(emptyDraft);
  const [editGallery, setEditGallery] = useState<ProductGalleryRow[]>([]);
  const [editVariants, setEditVariants] = useState<VariantDraftRow[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
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
    if (mode !== "inventory") return;
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
  }, [debouncedSearch, inventoryCategoryFilter, inventoryPage, mode]);

  useEffect(() => {
    if (mode !== "create") return;
    let cancelled = false;
    fetchProductCategories()
      .then((cats) => {
        if (!cancelled) setCategoryOptions(cats);
      })
      .catch(() => {
        if (!cancelled) setCategoryOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "inventory") return;
    const id = window.setTimeout(() => {
      void fetchList();
    }, 0);
    return () => clearTimeout(id);
  }, [fetchList, mode]);

  async function refreshAfterMutation() {
    if (mode === "inventory") {
      await fetchList();
    } else {
      try {
        setCategoryOptions(await fetchProductCategories());
      } catch {
        setCategoryOptions([]);
      }
    }
  }

  function applyAdminDetailToEditForm(detail: { product: Product; images: ProductGalleryRow[] }) {
    const prod = detail.product;
    setForm({
      name: prod.name,
      description: prod.description ?? "",
      price: String(prod.base_price ?? prod.price),
      sale_price: prod.sale_price != null ? String(prod.sale_price) : "",
      sale_ends_at: toDatetimeLocalValue(prod.sale_ends_at),
      category: prod.category ?? "",
      brand: prod.brand ?? "",
      tags: [...(prod.tags ?? [])],
      image_url: prod.image_url ?? "",
      video_url: prod.video_url ?? "",
      stock: String(prod.stock),
      product_code: prod.product_code ?? "",
      meta_title: prod.meta_title ?? "",
      meta_description: prod.meta_description ?? "",
      a_plus_json: prod.a_plus_modules?.length ? JSON.stringify(prod.a_plus_modules, null, 2) : "",
      is_hazardous: Boolean(prod.is_hazardous),
      minimum_age: prod.minimum_age != null && prod.minimum_age > 0 ? String(prod.minimum_age) : "",
      compliance_note: prod.compliance_note ?? "",
    });
    editAPlusJsonBaselineRef.current = prod.a_plus_modules?.length ? JSON.stringify(prod.a_plus_modules, null, 2) : "";
    setEditGallery([...detail.images].sort((a, b) => a.sort_order - b.sort_order));
    setEditVariants(
      (prod.variants ?? []).map((v) => ({
        key: v.id,
        serverId: v.id,
        label: v.label,
        price: String(v.price),
        stock: String(v.stock),
      })),
    );
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    editDetailForIdRef.current = p.id;
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: String(p.base_price ?? p.price),
      sale_price: p.sale_price != null ? String(p.sale_price) : "",
      sale_ends_at: toDatetimeLocalValue(p.sale_ends_at),
      category: p.category ?? "",
      brand: p.brand ?? "",
      tags: [...(p.tags ?? [])],
      image_url: p.image_url ?? "",
      video_url: p.video_url ?? "",
      stock: String(p.stock),
      product_code: p.product_code ?? "",
      meta_title: p.meta_title ?? "",
      meta_description: p.meta_description ?? "",
      a_plus_json: p.a_plus_modules?.length ? JSON.stringify(p.a_plus_modules, null, 2) : "",
      is_hazardous: Boolean(p.is_hazardous),
      minimum_age: p.minimum_age != null && p.minimum_age > 0 ? String(p.minimum_age) : "",
      compliance_note: p.compliance_note ?? "",
    });
    editAPlusJsonBaselineRef.current = p.a_plus_modules?.length ? JSON.stringify(p.a_plus_modules, null, 2) : "";
    setEditGallery([]);
    setEditVariants([]);
    setGalleryLoading(true);
    setMsg(null);
    setErr(null);
    const id = p.id;
    void (async () => {
      try {
        const detail = await adminGetProductDetail(token, id);
        if (editDetailForIdRef.current !== id) return;
        applyAdminDetailToEditForm(detail);
      } catch (e) {
        if (editDetailForIdRef.current !== id) return;
        setErr(e instanceof Error ? e.message : "โหลดรายละเอียดแกลเลอรี่ไม่สำเร็จ");
      } finally {
        if (editDetailForIdRef.current === id) setGalleryLoading(false);
      }
    })();
  }

  function cancelEdit() {
    editDetailForIdRef.current = null;
    setEditingId(null);
    setForm(emptyDraft);
    setEditGallery([]);
    setEditVariants([]);
    setGalleryLoading(false);
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
      const flash = flashPayloadFromForm(createForm.sale_price, createForm.sale_ends_at);
      if (flash === "incomplete") throw new Error("ตั้ง Flash deal ต้องกรอกทั้งราคาโปรและวัน-เวลาหมดโปร");
      if (flash !== "empty" && flash.sale_price != null && flash.sale_price >= price) {
        throw new Error("ราคา Flash deal ต้องต่ำกว่าราคาปกติ");
      }
      const galleryUrls = createGallery.map((x) => x.url.trim()).filter(Boolean);
      const image_url = galleryUrls[0] ?? null;
      const variantsPayload = variantUpsertsFromDraft(createVariants);
      const aPlus = parseAPlusModulesJson(createForm.a_plus_json);
      const minAge = parseMinimumAge(createForm.minimum_age);
      const created = await adminCreateProduct(token, {
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        price,
        category: createForm.category.trim() || null,
        brand: createForm.brand.trim() || null,
        tags: tagsForApi(createForm.tags),
        image_url,
        video_url: createForm.video_url.trim() || null,
        stock,
        product_code: createForm.product_code.trim() || null,
        meta_title: createForm.meta_title.trim() || null,
        meta_description: createForm.meta_description.trim() || null,
        is_hazardous: createForm.is_hazardous,
        minimum_age: minAge,
        compliance_note: createForm.compliance_note.trim() || null,
        ...(aPlus != null ? { a_plus_modules: aPlus } : {}),
        ...(flash === "empty" ? {} : flash),
        ...(variantsPayload.length > 0 ? { variants: variantsPayload } : {}),
      });
      let galleryError: string | null = null;
      try {
        for (let i = 1; i < galleryUrls.length; i++) {
          await adminAddProductGalleryImage(token, created.id, galleryUrls[i]);
        }
      } catch (e) {
        galleryError = e instanceof Error ? e.message : "เพิ่มรูปในแกลเลอรี่ไม่สำเร็จ";
      }
      setCreateForm(emptyDraft);
      setCreateGallery([]);
      setCreateVariants([]);
      setCreateUrlDraft("");
      if (galleryError) {
        setErr(
          `${galleryError} — สินค้าถูกสร้างแล้ว (รูปแรกอาจถูกบันทึกแล้ว) ลองเปิดแก้ไขสินค้านี้เพื่อเพิ่มรูปที่เหลือ`,
        );
        setMsg(null);
      } else {
        setErr(null);
        const variantNote =
          variantsPayload.length > 0 ? ` · ${variantsPayload.length} variant` : "";
        setMsg(
          galleryUrls.length > 1
            ? `สร้างสินค้าแล้ว — แนบรูป ${galleryUrls.length} ใบในแกลเลอรี่${variantNote}`
            : `สร้างสินค้าแล้ว${variantNote}`,
        );
      }
      await refreshAfterMutation();
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
      const flash = flashPayloadFromForm(form.sale_price, form.sale_ends_at);
      if (flash === "incomplete") throw new Error("ตั้ง Flash deal ต้องกรอกทั้งราคาโปรและวัน-เวลาหมดโปร");
      const listPrice = price ?? Number(form.price);
      if (flash !== "empty" && flash.sale_price != null && Number.isFinite(listPrice) && flash.sale_price >= listPrice) {
        throw new Error("ราคา Flash deal ต้องต่ำกว่าราคาปกติ");
      }
      const flashPart =
        flash === "empty" ? { sale_price: null as number | null, sale_ends_at: null as string | null } : flash;
      const body: Parameters<typeof adminUpdateProduct>[2] = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        category: form.category.trim() || null,
        brand: form.brand.trim() || null,
        tags: tagsForApi(form.tags),
        stock,
        video_url: form.video_url.trim() || null,
        product_code: form.product_code.trim() || null,
        meta_title: form.meta_title.trim() || null,
        meta_description: form.meta_description.trim() || null,
        ...flashPart,
      };
      const apTrim = form.a_plus_json.trim();
      const apBase = editAPlusJsonBaselineRef.current.trim();
      if (apTrim !== apBase) {
        body.a_plus_modules = apTrim ? parseAPlusModulesJson(form.a_plus_json) : null;
      }
      const minAge = parseMinimumAge(form.minimum_age);
      body.is_hazardous = form.is_hazardous;
      body.minimum_age = minAge;
      body.compliance_note = form.compliance_note.trim() || null;
      if (editGallery.length === 0) {
        body.image_url = form.image_url.trim() || null;
      }

      body.variants = variantUpsertsFromDraft(editVariants);

      await adminUpdateProduct(token, editingId, body);
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
    const ok = await confirm({
      title: "ลบสินค้า",
      message: `ลบสินค้า "${p.name}"?\nถ้าสินค้านี้อยู่ในคำสั่งซื้อ ระบบจะไม่ให้ลบ (409)`,
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
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

  async function uploadCreateGalleryFiles(files: FileList | File[] | null | undefined) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setUploading("create");
    setErr(null);
    try {
      const added: CreatePendingImage[] = [];
      for (const file of list) {
        const { url } = await adminUploadProductImage(token, file);
        added.push({ key: newCreateImageKey(), url });
      }
      setCreateGallery((g) => [...g, ...added]);
      setMsg(added.length > 1 ? `อัปโหลดแล้ว ${added.length} รูป` : "อัปโหลดรูปแล้ว 1 รูป");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(null);
      if (createFileRef.current) createFileRef.current.value = "";
    }
  }

  function addCreateGalleryUrlsFromDraft() {
    const raw = createUrlDraft.trim();
    if (!raw) return;
    const parts = raw
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) {
      setCreateUrlDraft("");
      return;
    }
    setCreateGallery((g) => [...g, ...parts.map((url) => ({ key: newCreateImageKey(), url }))]);
    setCreateUrlDraft("");
    setMsg(`เพิ่ม URL แล้ว ${parts.length} รายการ`);
  }

  function removeCreateGalleryItem(key: string) {
    setCreateGallery((g) => g.filter((x) => x.key !== key));
  }

  function moveCreateGalleryItem(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= createGallery.length) return;
    setCreateGallery((g) => {
      const next = [...g];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function uploadEditGalleryFile(file: File | undefined) {
    if (!file) return;
    setUploading("edit");
    setErr(null);
    try {
      const { url } = await adminUploadProductImage(token, file);
      const pid = editingId;
      if (pid) {
        setGalleryBusy(true);
        try {
          const detail = await adminAddProductGalleryImage(token, pid, url);
          if (editDetailForIdRef.current === pid) applyAdminDetailToEditForm(detail);
          setMsg("เพิ่มรูปในแกลเลอรี่แล้ว");
        } finally {
          setGalleryBusy(false);
        }
      } else {
        setForm((f) => ({ ...f, image_url: url }));
        setMsg("อัปโหลดรูปแล้ว");
      }
      if (editFileRef.current) editFileRef.current.value = "";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(null);
    }
  }

  async function removeGalleryImage(imageId: string) {
    if (!editingId) return;
    const ok = await confirm({
      title: "ลบรูป",
      message: "ลบรูปนี้จากแกลเลอรี่?",
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    setGalleryBusy(true);
    setErr(null);
    try {
      const detail = await adminDeleteProductGalleryImage(token, editingId, imageId);
      if (editDetailForIdRef.current === editingId) applyAdminDetailToEditForm(detail);
      setMsg("ลบรูปแล้ว");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบรูปไม่สำเร็จ");
    } finally {
      setGalleryBusy(false);
    }
  }

  async function moveGalleryImage(idx: number, dir: -1 | 1) {
    if (!editingId) return;
    const j = idx + dir;
    if (j < 0 || j >= editGallery.length) return;
    const next = [...editGallery];
    [next[idx], next[j]] = [next[j], next[idx]];
    setGalleryBusy(true);
    setErr(null);
    try {
      const detail = await adminReorderProductGallery(
        token,
        editingId,
        next.map((row) => row.id),
      );
      if (editDetailForIdRef.current === editingId) applyAdminDetailToEditForm(detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "จัดเรียงรูปไม่สำเร็จ");
    } finally {
      setGalleryBusy(false);
    }
  }

  const invRangeStart = total === 0 ? 0 : (inventoryPage - 1) * INVENTORY_PAGE_SIZE + 1;
  const invRangeEnd = Math.min(inventoryPage * INVENTORY_PAGE_SIZE, total);

  return (
    <div className="rounded-3xl border border-stone-200/90 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:p-8">
      {mode === "inventory" ? (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">สต็อกสินค้า</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            ค้นหา กรองหมวด แก้ไขจำนวนคงเหลือ ราคา และ Flash deal หรือลบสินค้า — หากสินค้าถูกใช้ในคำสั่งซื้อแล้วระบบจะไม่ให้ลบ (HTTP 409)
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
      ) : (
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">เพิ่มสินค้าใหม่</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            สร้างรายการใหม่ — แก้ไขจำนวนคงเหลือ ดูรายการ และลบได้ที่ «สต็อกสินค้า» ในเมนูด้านข้าง
          </p>
        </div>
      )}

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

      {mode === "create" ? (
        <form
          onSubmit={submitCreate}
          className="mt-8 w-full min-w-0 space-y-4 rounded-xl border border-stone-200/90 bg-gradient-to-b from-stone-50/90 to-stone-50/40 p-5 shadow-sm ring-1 ring-stone-200/30 dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-950/40 dark:ring-zinc-800/50"
        >
          <div className="space-y-0.5">
            <h3 className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-50 sm:text-[1.0625rem]">
              เพิ่มสินค้าใหม่
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              รูปได้หลายใบ — เลือกหลายไฟล์พร้อมกันหรือวาง URL หลายอัน · แท็กไม่บังคับ
            </p>
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
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              รหัสสินค้า (ASIN/SKU) — ว่างได้ ระบบจะสร้าง REC-… ให้อัตโนมัติ
              <input
                value={createForm.product_code}
                onChange={(e) => setCreateForm((d) => ({ ...d, product_code: e.target.value }))}
                placeholder="เช่น MY-SKU-001"
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-sm uppercase shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              SEO — title (แท็บเบราว์เซอร์ / Open Graph)
              <input
                value={createForm.meta_title}
                onChange={(e) => setCreateForm((d) => ({ ...d, meta_title: e.target.value }))}
                maxLength={300}
                placeholder="ว่าง = ใช้ชื่อสินค้า"
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              SEO — meta description
              <textarea
                rows={2}
                value={createForm.meta_description}
                onChange={(e) => setCreateForm((d) => ({ ...d, meta_description: e.target.value }))}
                maxLength={500}
                placeholder="สรุปสั้นๆ สำหรับผลการค้นหา — ว่าง = ใช้รายละเอียดสินค้า"
                className="mt-1.5 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <div className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 sm:col-span-2 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">ข้อจำกับ / hazmat (แสดงบน PDP)</p>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-800 dark:text-stone-200">
                <input
                  type="checkbox"
                  checked={createForm.is_hazardous}
                  onChange={(e) => setCreateForm((d) => ({ ...d, is_hazardous: e.target.checked }))}
                  className="rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                />
                สินค้าอันตรายหรือจัดเก็บพิเศษ (ข้อจำกัดการขนส่ง)
              </label>
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                จำกัดอายุผู้ซื้อ (ปี) — ว่าง = ไม่จำกัด
                <input
                  inputMode="numeric"
                  value={createForm.minimum_age}
                  onChange={(e) => setCreateForm((d) => ({ ...d, minimum_age: e.target.value }))}
                  placeholder="เช่น 18"
                  className="mt-1.5 w-full max-w-[8rem] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm tabular-nums shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
                หมายเหตุข้อจำกัดการส่ง / ปฏิบัติตามกฎ
                <textarea
                  rows={2}
                  value={createForm.compliance_note}
                  onChange={(e) => setCreateForm((d) => ({ ...d, compliance_note: e.target.value }))}
                  maxLength={2000}
                  placeholder="เช่น ส่งได้เฉพาะทางบก — ไม่ส่งต่างประเทศ"
                  className="mt-1.5 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                />
              </label>
            </div>
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
              Flash deal — ราคาโปร (ไม่บังคับ)
              <input
                inputMode="decimal"
                value={createForm.sale_price}
                onChange={(e) => setCreateForm((d) => ({ ...d, sale_price: e.target.value }))}
                placeholder="เช่น 29.99 — ต้องต่ำกว่าราคาปกติ"
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm tabular-nums shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <label className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:gap-4">
              <span className="shrink-0 text-xs font-medium text-stone-700 dark:text-stone-300 sm:max-w-[min(100%,20rem)] sm:leading-snug sm:pt-0.5">
                หมดโปรเมื่อ (local) — ต้องกรอกคู่กับราคาโปร
              </span>
              <input
                type="datetime-local"
                value={createForm.sale_ends_at}
                onChange={(e) => setCreateForm((d) => ({ ...d, sale_ends_at: e.target.value }))}
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm tabular-nums shadow-sm outline-none transition [color-scheme:light] focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100 dark:[color-scheme:dark]"
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
              แบรนด์ — ใช้สร้างหน้า storefront (/brands)
              <input
                value={createForm.brand}
                onChange={(e) => setCreateForm((d) => ({ ...d, brand: e.target.value }))}
                placeholder="เช่น Acme Co. — ว่างได้"
                maxLength={120}
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
            </label>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              เนื้อหา A+ (JSON array) — ว่างได้ · โมดูล: banner, feature_list, image_text
              <textarea
                rows={5}
                value={createForm.a_plus_json}
                onChange={(e) => setCreateForm((d) => ({ ...d, a_plus_json: e.target.value }))}
                spellCheck={false}
                placeholder={`[\n  {"type":"banner","headline":"Welcome","body":"ข้อความ","image_url":"/uploads/products/…"},\n  {"type":"feature_list","title":"จุดเด่น","items":["ข้อ 1","ข้อ 2"]},\n  {"type":"image_text","title":"รายละเอียด","body":"…","image_url":"/uploads/products/…","image_align":"left"}\n]`}
                className="mt-1.5 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
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
            <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 p-3 dark:border-zinc-600 dark:bg-zinc-950/40 sm:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-stone-700 dark:text-stone-200">
                  Variants (ไม่บังคับ) — สร้างพร้อมสินค้าได้
                </p>
                <button
                  type="button"
                  disabled={busyId === "__create__" || uploading !== null}
                  onClick={() =>
                    setCreateVariants((rows) => [
                      ...rows,
                      { key: newCreateImageKey(), label: "", price: "0", stock: "0" },
                    ])
                  }
                  className="rounded-lg border border-teal-300 bg-teal-50/80 px-2 py-1 text-[11px] font-semibold text-teal-900 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-100"
                >
                  + เพิ่ม variant
                </button>
              </div>
              {createVariants.length === 0 ? (
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  เว้นว่างได้ — หรือเพิ่มหลาย SKU (ชื่อ, ราคา, สต็อก)
                </p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-0.5">
                  {createVariants.map((row: VariantDraftRow, idx: number) => (
                    <li
                      key={row.key}
                      className="flex flex-wrap items-end gap-2 rounded-lg border border-stone-200/90 bg-stone-50/90 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900/60"
                    >
                      <span className="self-center text-[10px] font-medium tabular-nums text-stone-400">{idx + 1}.</span>
                      <label className="min-w-[7rem] flex-1">
                        <span className="sr-only">ชื่อ variant</span>
                        <input
                          value={row.label}
                          onChange={(e) =>
                            setCreateVariants((rs) =>
                              rs.map((x) => (x.key === row.key ? { ...x, label: e.target.value } : x)),
                            )
                          }
                          placeholder="เช่น Size L · Red"
                          className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <label className="w-20">
                        <span className="text-[10px] text-stone-500 dark:text-stone-400">ราคา</span>
                        <input
                          inputMode="decimal"
                          value={row.price}
                          onChange={(e) =>
                            setCreateVariants((rs) =>
                              rs.map((x) => (x.key === row.key ? { ...x, price: e.target.value } : x)),
                            )
                          }
                          className="mt-0.5 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <label className="w-[4.5rem]">
                        <span className="text-[10px] text-stone-500 dark:text-stone-400">สต็อก</span>
                        <input
                          inputMode="numeric"
                          value={row.stock}
                          onChange={(e) =>
                            setCreateVariants((rs) =>
                              rs.map((x) => (x.key === row.key ? { ...x, stock: e.target.value } : x)),
                            )
                          }
                          className="mt-0.5 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busyId === "__create__"}
                        onClick={() => setCreateVariants((rs) => rs.filter((x) => x.key !== row.key))}
                        className="rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700 dark:border-rose-900 dark:text-rose-400"
                      >
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 sm:col-span-2">
              ลิงก์วิดีโอ (YouTube / Vimeo — ไม่บังคับ)
              <input
                type="url"
                inputMode="url"
                value={createForm.video_url}
                onChange={(e) => setCreateForm((d) => ({ ...d, video_url: e.target.value }))}
                placeholder="https://www.youtube.com/watch?v=… หรือ https://vimeo.com/…"
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
              />
              <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                ว่างได้ — ถ้ากรอกจะฝังบนหน้ารายละเอียดสินค้า (รองรับ youtube.com, youtu.be, vimeo.com)
              </p>
            </label>
            <div className="sm:col-span-2 space-y-2 rounded-lg border border-stone-200/80 bg-white/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
              <p className="text-xs font-medium text-stone-700 dark:text-stone-200">รูปสินค้า (หลายรูปได้)</p>
              <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                รูปแรกในรายการ = รูปปก · เลือกหลายไฟล์ในครั้งเดียว (Ctrl/Shift+คลิก) หรืออัปโหลดทีละรอบก็ได้
              </p>
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
                เลือกไฟล์ — รองรับหลายไฟล์
                <input
                  ref={createFileRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.svg,.ico,.heic,.heif"
                  disabled={uploading !== null || busyId === "__create__"}
                  onChange={(e) => void uploadCreateGalleryFiles(e.target.files)}
                  className="mt-1.5 block w-full text-xs text-stone-600 file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-teal-600 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white file:shadow-sm hover:file:bg-teal-500 disabled:opacity-50 dark:text-stone-300"
                />
              </label>
              <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                JPEG, PNG, WebP, GIF, AVIF, BMP, SVG, ICO, HEIC/HEIF — สูงสุด 5MB ต่อไฟล์ (รองรับไฟล์ที่ Windows ส่งมาเป็น octet-stream โดยอ่านจากนามสกุล/เนื้อไฟล์)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block min-w-0 flex-1 text-xs font-medium text-stone-600 dark:text-stone-300">
                  เพิ่มจาก URL
                  <input
                    value={createUrlDraft}
                    onChange={(e) => setCreateUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCreateGalleryUrlsFromDraft();
                      }
                    }}
                    placeholder="https://… หรือวางหลาย URL คั่นด้วยเว้นวรรค / บรรทัดใหม่"
                    className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <button
                  type="button"
                  disabled={uploading !== null || busyId === "__create__" || !createUrlDraft.trim()}
                  onClick={() => addCreateGalleryUrlsFromDraft()}
                  className="shrink-0 rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:bg-teal-900/50"
                >
                  เพิ่ม URL
                </button>
              </div>
              {createGallery.length > 0 ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] font-medium text-stone-600 dark:text-stone-300">
                    คิวรูป ({createGallery.length}) — จัดเรียงด้วยปุ่มลูกศร · รูปแรกเป็นปก
                  </p>
                  <ul className="max-h-60 space-y-2 overflow-y-auto pr-0.5">
                    {createGallery.map((row, idx) => (
                      <li
                        key={row.key}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200/90 bg-stone-50/90 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-900/60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview */}
                        <img
                          src={displayImageSrc(row.url)}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-md object-cover ring-1 ring-stone-200 dark:ring-zinc-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-stone-700 dark:text-stone-200">
                            {idx === 0 ? "ปก" : `ลำดับที่ ${idx + 1}`}
                          </p>
                          <p className="truncate font-mono text-[10px] text-stone-500 dark:text-stone-400" title={row.url}>
                            {row.url}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={uploading !== null || busyId === "__create__" || idx === 0}
                            onClick={() => moveCreateGalleryItem(idx, -1)}
                            className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-800 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={uploading !== null || busyId === "__create__" || idx >= createGallery.length - 1}
                            onClick={() => moveCreateGalleryItem(idx, 1)}
                            className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-800 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            disabled={uploading !== null || busyId === "__create__"}
                            onClick={() => removeCreateGalleryItem(row.key)}
                            className="rounded border border-rose-300 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-400"
                          >
                            ลบ
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[11px] text-stone-500 dark:text-stone-400">ยังไม่มีรูปในรายการ — ไม่บังคับ</p>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={busyId === "__create__" || uploading !== null}
            className="w-full rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-600/20 transition hover:from-teal-500 hover:to-emerald-500 active:scale-[0.99] disabled:opacity-50"
          >
            {busyId === "__create__" ? "กำลังสร้าง…" : uploading === "create" ? "กำลังอัปโหลดรูป…" : "เพิ่มสินค้า"}
          </button>
        </form>
      ) : null}

      {mode === "inventory" ? (
        <section className="mt-8 w-full min-h-0 space-y-4">
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
                      <label className="sm:col-span-2 block text-[11px] font-medium text-stone-600 dark:text-stone-300">
                        รหัสสินค้า (SKU / ASIN-style)
                        <input
                          value={form.product_code}
                          onChange={(e) => setForm((f) => ({ ...f, product_code: e.target.value }))}
                          className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-mono text-sm uppercase dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <label className="sm:col-span-2 block text-[11px] font-medium text-stone-600 dark:text-stone-300">
                        SEO title
                        <input
                          value={form.meta_title}
                          onChange={(e) => setForm((f) => ({ ...f, meta_title: e.target.value }))}
                          maxLength={300}
                          className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <label className="sm:col-span-2 block text-[11px] font-medium text-stone-600 dark:text-stone-300">
                        SEO meta description
                        <textarea
                          rows={2}
                          value={form.meta_description}
                          onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))}
                          maxLength={500}
                          className="mt-1 w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <div className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 sm:col-span-2 dark:border-amber-900/40 dark:bg-amber-950/20">
                        <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">ข้อจำกับ / hazmat</p>
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-800 dark:text-stone-200">
                          <input
                            type="checkbox"
                            checked={form.is_hazardous}
                            onChange={(e) => setForm((f) => ({ ...f, is_hazardous: e.target.checked }))}
                            className="rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                          />
                          สินค้าอันตรายหรือจัดเก็บพิเศษ
                        </label>
                        <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-300">
                          จำกัดอายุ (ปี) — ว่าง = ไม่จำกัด
                          <input
                            inputMode="numeric"
                            value={form.minimum_age}
                            onChange={(e) => setForm((f) => ({ ...f, minimum_age: e.target.value }))}
                            placeholder="18"
                            className="mt-1 w-full max-w-[8rem] rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
                          />
                        </label>
                        <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-300">
                          หมายเหตุข้อจำกัดการส่ง
                          <textarea
                            rows={2}
                            value={form.compliance_note}
                            onChange={(e) => setForm((f) => ({ ...f, compliance_note: e.target.value }))}
                            maxLength={2000}
                            className="mt-1 w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                          />
                        </label>
                      </div>
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
                      <label className="sm:col-span-2 block text-[11px] font-medium text-stone-600 dark:text-stone-300">
                        Flash deal — ราคาโปร (ว่างทั้งคู่ = ปิดโปร)
                        <input
                          inputMode="decimal"
                          value={form.sale_price}
                          onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))}
                          placeholder="ต่ำกว่าราคาปกติ"
                          className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <label className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                        <span className="shrink-0 text-xs font-medium text-stone-700 dark:text-stone-300 sm:max-w-[min(100%,20rem)] sm:leading-snug sm:pt-0.5">
                          หมดโปรเมื่อ (local) — ต้องกรอกคู่กับราคาโปร
                        </span>
                        <input
                          type="datetime-local"
                          value={form.sale_ends_at}
                          onChange={(e) => setForm((f) => ({ ...f, sale_ends_at: e.target.value }))}
                          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm tabular-nums outline-none transition [color-scheme:light] focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100 dark:[color-scheme:dark]"
                        />
                      </label>
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
                      <label className="sm:col-span-2 block text-[11px] font-medium text-stone-600 dark:text-stone-300">
                        แบรนด์
                        <input
                          value={form.brand}
                          onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                          maxLength={120}
                          placeholder="เช่น Acme Co."
                          className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      <label className="sm:col-span-2 block text-[11px] font-medium text-stone-600 dark:text-stone-300">
                        A+ เนื้อหา (JSON array) — เว้นว่างคงค่าเดิมเมื่อไม่แก้
                        <textarea
                          rows={5}
                          value={form.a_plus_json}
                          onChange={(e) => setForm((f) => ({ ...f, a_plus_json: e.target.value }))}
                          spellCheck={false}
                          className="mt-1 w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
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
                      <div className="sm:col-span-2 rounded-xl border border-dashed border-stone-300 bg-stone-50/50 p-4 dark:border-zinc-600 dark:bg-zinc-900/30">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-medium text-stone-600 dark:text-stone-300">
                            Variants — บันทึกครั้งนี้จะแทนที่รายการทั้งหมด (เว้นว่าง = ไม่มีตัวเลือก)
                          </p>
                          <button
                            type="button"
                            disabled={busyId === editingId || uploading !== null}
                            onClick={() =>
                              setEditVariants((rows) => [
                                ...rows,
                                { key: newCreateImageKey(), label: "", price: "0", stock: "0" },
                              ])
                            }
                            className="rounded-lg border border-teal-300 bg-white px-2 py-1 text-[11px] font-semibold text-teal-800 dark:border-teal-700 dark:bg-zinc-900 dark:text-teal-200"
                          >
                            + เพิ่ม variant
                          </button>
                        </div>
                        {editVariants.length === 0 ? (
                          <p className="text-xs text-stone-500 dark:text-stone-400">
                            ยังไม่มี variant — เหมาะกับสินค้ามี SKU เดียว
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {editVariants.map((row, idx) => (
                              <li
                                key={row.key}
                                className="flex flex-wrap items-end gap-2 rounded-lg border border-stone-200/80 bg-white/80 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-950/60"
                              >
                                <span className="self-center text-[10px] font-medium tabular-nums text-stone-400">
                                  {idx + 1}.
                                </span>
                                <label className="min-w-[8rem] flex-1">
                                  <span className="sr-only">ชื่อ variant</span>
                                  <input
                                    value={row.label}
                                    onChange={(e) =>
                                      setEditVariants((rs) =>
                                        rs.map((x) => (x.key === row.key ? { ...x, label: e.target.value } : x)),
                                      )
                                    }
                                    placeholder="เช่น Size L · Red"
                                    className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                                  />
                                </label>
                                <label className="w-24">
                                  <span className="text-[10px] text-stone-500 dark:text-stone-400">ราคา</span>
                                  <input
                                    inputMode="decimal"
                                    value={row.price}
                                    onChange={(e) =>
                                      setEditVariants((rs) =>
                                        rs.map((x) => (x.key === row.key ? { ...x, price: e.target.value } : x)),
                                      )
                                    }
                                    className="mt-0.5 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
                                  />
                                </label>
                                <label className="w-20">
                                  <span className="text-[10px] text-stone-500 dark:text-stone-400">สต็อก</span>
                                  <input
                                    inputMode="numeric"
                                    value={row.stock}
                                    onChange={(e) =>
                                      setEditVariants((rs) =>
                                        rs.map((x) => (x.key === row.key ? { ...x, stock: e.target.value } : x)),
                                      )
                                    }
                                    className="mt-0.5 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={busyId === editingId}
                                  onClick={() => setEditVariants((rs) => rs.filter((x) => x.key !== row.key))}
                                  className="rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700 dark:border-rose-900 dark:text-rose-400"
                                >
                                  ลบ
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <label className="sm:col-span-2 block">
                        <span className="mb-1 block text-[11px] font-medium text-stone-500 dark:text-stone-400">
                          ลิงก์วิดีโอ (YouTube / Vimeo)
                        </span>
                        <input
                          type="url"
                          inputMode="url"
                          value={form.video_url}
                          onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                          placeholder="https://…"
                          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        />
                      </label>
                      {galleryLoading ? (
                        <p className="text-xs text-stone-500 sm:col-span-2 dark:text-stone-400">กำลังโหลดแกลเลอรี่…</p>
                      ) : null}
                      {editGallery.length > 0 ? (
                        <div className="sm:col-span-2 space-y-2">
                          <p className="text-[11px] font-medium text-stone-600 dark:text-stone-300">
                            แกลเลอรี่ ({editGallery.length} รูป) — รูปแรกคือปกสินค้า
                          </p>
                          <ul className="flex flex-col gap-2">
                            {editGallery.map((row, idx) => (
                              <li
                                key={row.id}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200/90 bg-stone-50/80 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={displayImageSrc(row.image_url)}
                                  alt=""
                                  className="h-14 w-14 shrink-0 rounded-md object-cover ring-1 ring-stone-200 dark:ring-zinc-600"
                                />
                                <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                  {idx === 0 ? "ปก" : `ลำดับที่ ${idx + 1}`}
                                </span>
                                <div className="ml-auto flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    disabled={galleryBusy || galleryLoading || idx === 0}
                                    onClick={() => void moveGalleryImage(idx, -1)}
                                    className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    disabled={galleryBusy || galleryLoading || idx >= editGallery.length - 1}
                                    onClick={() => void moveGalleryImage(idx, 1)}
                                    className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    disabled={galleryBusy || galleryLoading}
                                    onClick={() => void removeGalleryImage(row.id)}
                                    className="rounded border border-rose-300 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-400"
                                  >
                                    ลบ
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <p className="text-[11px] leading-snug text-stone-500 sm:col-span-2 dark:text-stone-400">
                        {editGallery.length > 0
                          ? "รูปหลักตามลำดับแรก — ใช้ปุ่มลูกศรสลับตำแหน่ง"
                          : "เมื่อยังไม่มีรูปในแกลเลอรี่ ใส่ URL ด้านล่างได้ — พออัปโหลดไฟล์ ระบบจะสร้างแกลเลอรี่และตั้งรูปแรกเป็นปก"}
                      </p>
                      <label className="block text-[11px] font-medium text-stone-500 dark:text-stone-400 sm:col-span-2">
                        เพิ่มรูป (อัปโหลดเข้าแกลเลอรี่)
                        <input
                          ref={editFileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.svg,.ico,.heic,.heif"
                          disabled={uploading !== null || galleryBusy || galleryLoading}
                          onChange={(e) => void uploadEditGalleryFile(e.target.files?.[0])}
                          className="mt-1 block w-full text-xs text-stone-600 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-600 file:px-3 file:py-1.5 file:font-semibold file:text-white hover:file:bg-teal-500 disabled:opacity-50 dark:text-stone-300"
                        />
                      </label>
                      {form.image_url ? (
                        <div className="sm:col-span-2">
                          <p className="text-[11px] text-stone-500 dark:text-stone-400">ตัวอย่างปก / รูปหลัก</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={displayImageSrc(form.image_url)}
                            alt=""
                            className="mt-1 h-20 max-w-full rounded-lg object-contain object-left ring-1 ring-stone-200 dark:ring-zinc-700"
                          />
                        </div>
                      ) : null}
                      <label className="block sm:col-span-2">
                        <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                          {editGallery.length > 0
                            ? "URL รูปเดี่ยว (ปิดเมื่อมีแกลเลอรี่ — แก้จากรายการด้านบน)"
                            : "หรือ URL รูปเมื่อยังไม่มีแกลเลอรี่"}
                        </span>
                        <input
                          value={form.image_url}
                          onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                          placeholder="https://…"
                          disabled={editGallery.length > 0}
                          className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-55 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busyId === editingId || uploading !== null || galleryBusy}
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
                          {p.product_code ? (
                            <p className="mt-0.5 font-mono text-[11px] text-stone-500 dark:text-zinc-500">
                              รหัส: {p.product_code}
                              <Link
                                href={`/products/code/${encodeURIComponent(p.product_code)}`}
                                className="ml-2 text-teal-600 underline dark:text-teal-400"
                              >
                                ลิงก์สั้น
                              </Link>
                            </p>
                          ) : null}
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
                              {p.compare_at_price != null && p.compare_at_price > p.price ? (
                                <span className="mr-2 text-stone-400 line-through dark:text-stone-500">
                                  ${p.compare_at_price.toFixed(2)}
                                </span>
                              ) : null}
                              ${p.price.toFixed(2)}
                              {p.compare_at_price != null && p.compare_at_price > p.price ? (
                                <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                                  Sale
                                </span>
                              ) : null}
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
      ) : null}
    </div>
  );
}
