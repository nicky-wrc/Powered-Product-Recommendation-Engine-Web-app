function trimBase(v: string | undefined): string | undefined {
  if (v == null || v === "") return undefined;
  return v.replace(/\/$/, "");
}

/**
 * Browser: default "" → fetch `/api/...` on the Next host (rewrites to FastAPI — avoids CORS).
 * Set NEXT_PUBLIC_API_URL only if you need direct cross-origin calls (then ensure FastAPI CORS matches).
 * Server (RSC): calls FastAPI directly via 127.0.0.1 or API_INTERNAL_URL (Docker: e.g. http://host.docker.internal:8000).
 */
export const API_BASE =
  typeof window === "undefined"
    ? (trimBase(process.env.API_INTERNAL_URL) ?? trimBase(process.env.NEXT_PUBLIC_API_URL) ?? "http://127.0.0.1:8000")
    : (trimBase(process.env.NEXT_PUBLIC_API_URL) ?? "");

/** When fetch() rejects (backend down, wrong URL, browser blocked request). */
export function formatNetworkError(error: unknown): string {
  if (error instanceof TypeError) {
    const m = error.message || "";
    if (/fetch|Failed to fetch|NetworkError|Load failed|network/i.test(m)) {
      const where =
        typeof window !== "undefined" && !API_BASE
          ? "same-origin /api (proxied to FastAPI — check API_PROXY_TARGET and that uvicorn is on :8000)"
          : `API at ${API_BASE}`;
      return `Cannot reach ${where}. Start FastAPI (e.g. python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 from backend/). Restart next dev after changing .env.`;
    }
    return m || "Network error";
  }
  if (error instanceof Error) return error.message;
  return "Network error";
}

export type ProductVariant = {
  id: string;
  label: string;
  price: number;
  stock: number;
  options?: Record<string, string> | null;
};

/** Quantity breaks: same line item SKU shares tier totals in cart/checkout. */
export type VolumeTier = {
  min_qty: number;
  unit_price: number;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  /** Current price (after flash deal if active). */
  price: number;
  /** List/catalog price; mirrors `price` when no flash data present. */
  base_price?: number;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_ends_at?: string | null;
  category: string | null;
  brand?: string | null;
  brand_slug?: string | null;
  tags: string[] | null;
  image_url: string | null;
  /** YouTube / Vimeo watch URL; PDP converts to embed. */
  video_url?: string | null;
  /** Ordered gallery for PDP; list APIs may repeat [image_url] for compatibility. */
  image_urls?: string[];
  stock: number;
  has_variants?: boolean;
  variants?: ProductVariant[];
  is_gift_card?: boolean;
  /** Stable catalog code (ASIN-style); unique when set. */
  product_code?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  /** Amazon-style A+ blocks for PDP (validated server-side). */
  a_plus_modules?: Record<string, unknown>[] | null;
  /** Hazmat / compliance (storefront notices; no legal certification). */
  is_hazardous?: boolean;
  minimum_age?: number | null;
  compliance_note?: string | null;
  /** Volume / tier unit pricing; applied by total quantity per product + variant in cart. */
  volume_tiers?: VolumeTier[] | null;
};

export type ProductPriceHistoryPoint = {
  day: string;
  unit_price: number;
};

export type ProductPriceHistoryResponse = {
  product_id: string;
  currency?: string;
  points: ProductPriceHistoryPoint[];
  period_low: number | null;
  period_high: number | null;
};

/** True for images stored under our static mount (use with next/image unoptimized in dev/proxy setups). */
export function isLocalUploadImageUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith("/uploads/");
}

function resolveRawProductImageUrl(productId: string, u: string | null | undefined): string | null {
  if (!u) return null;
  if (/unsplash\.com/i.test(u)) {
    return `https://picsum.photos/seed/p-${productId.replace(/-/g, "")}/800/600`;
  }
  if (u.startsWith("/uploads/")) {
    return u;
  }
  return u;
}

/** Stable Picsum URL for dead Unsplash hotlinks (aligned with backend repair_legacy_image_urls). */
export function productImageUrl(product: Product): string | null {
  const raw = product.image_urls?.length ? product.image_urls[0] : product.image_url;
  return resolveRawProductImageUrl(product.id, raw);
}

/** All gallery images resolved for carousels / structured data. */
export function productGalleryUrls(product: Product): string[] {
  const raw =
    product.image_urls?.length ? product.image_urls : product.image_url ? [product.image_url] : [];
  return raw.map((u) => resolveRawProductImageUrl(product.id, u)).filter((x): x is string => x != null && x !== "");
}

export type User = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  /** Loyalty balance (redeem in cart; 100 pts = $1 off by default). */
  loyalty_points?: number;
  avatar_url?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  /** Prefill Stripe Checkout with account email when paying from cart (opt-in in Profile). */
  express_checkout_enabled?: boolean;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

const TOKEN_KEY = "recengine_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Dispatch after profile / avatar changes so the header can refetch `/auth/me`. */
export const PROFILE_UPDATED_EVENT = "nickyshop-profile-updated";

export function notifyProfileUpdated(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

export type ProfileUpdatePayload = {
  name?: string;
  email?: string;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  express_checkout_enabled?: boolean;
};

export async function fetchMe(token: string): Promise<User> {
  const r = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function patchProfile(token: string, body: ProfileUpdatePayload): Promise<User> {
  const r = await fetch(`${API_BASE}/api/auth/me`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function changePassword(
  token: string,
  body: { current_password: string; new_password: string },
): Promise<User> {
  const r = await fetch(`${API_BASE}/api/auth/me/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function uploadProfileAvatar(token: string, file: File): Promise<User> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/auth/me/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function deleteProfileAvatar(token: string): Promise<User> {
  const r = await fetch(`${API_BASE}/api/auth/me/avatar`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type UserAddress = {
  id: string;
  user_id: string;
  label: string | null;
  recipient_name: string | null;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  is_default: boolean;
  created_at: string;
};

export type UserAddressCreatePayload = {
  label?: string | null;
  recipient_name?: string | null;
  phone?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_default?: boolean;
};

export type UserAddressUpdatePayload = {
  label?: string | null;
  recipient_name?: string | null;
  phone?: string | null;
  address_line1?: string;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_default?: boolean;
};

export async function fetchUserAddresses(token: string): Promise<UserAddress[]> {
  const r = await fetch(`${API_BASE}/api/addresses`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function createUserAddress(token: string, body: UserAddressCreatePayload): Promise<UserAddress> {
  const r = await fetch(`${API_BASE}/api/addresses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function updateUserAddress(
  token: string,
  id: string,
  body: UserAddressUpdatePayload,
): Promise<UserAddress> {
  const r = await fetch(`${API_BASE}/api/addresses/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function setDefaultUserAddress(token: string, id: string): Promise<UserAddress> {
  const r = await fetch(`${API_BASE}/api/addresses/${id}/default`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function deleteUserAddress(token: string, id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/addresses/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
}

/** FastAPI/Pydantic validation errors (422) or string detail */
export async function readApiErrorMessage(r: Response): Promise<string> {
  try {
    const j: unknown = await r.json();
    if (j && typeof j === "object" && "detail" in j) {
      const d = (j as { detail: unknown }).detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d)) {
        const parts = d.map((item: unknown) => {
          if (item && typeof item === "object" && "msg" in item) {
            const msg = (item as { msg?: string }).msg;
            if (typeof msg === "string") return msg;
          }
          try {
            return JSON.stringify(item);
          } catch {
            return String(item);
          }
        });
        const s = parts.filter(Boolean).join(" · ");
        if (s) return s;
      }
    }
  } catch {
    /* ignore */
  }
  return r.statusText || `Error ${r.status}`;
}

export async function fetchPopular(limit = 12): Promise<Product[]> {
  const r = await fetch(`${API_BASE}/api/recommendations/popular?limit=${limit}`, {
    next: { revalidate: 30 },
  });
  if (!r.ok) throw new Error("Failed to load recommendations");
  return r.json();
}

export type RecommendationMeta = {
  mode: "popular" | "collaborative" | "content" | "hybrid";
  used_collaborative: boolean;
  used_content: boolean;
  fallback_popular: boolean;
};

export type PersonalizedFeed = {
  products: Product[];
  meta: RecommendationMeta;
};

export async function fetchPersonalized(
  token: string,
  limit = 12,
  mode: RecommendationMeta["mode"] = "hybrid",
): Promise<PersonalizedFeed> {
  const r = await fetch(
    `${API_BASE}/api/recommendations/me?limit=${limit}&mode=${encodeURIComponent(mode)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!r.ok) throw new Error("Failed to load personalized feed");
  return r.json();
}

export async function fetchProductCategories(): Promise<string[]> {
  const r = await fetch(`${API_BASE}/api/products/categories`, {
    next: { revalidate: 30 },
  });
  if (!r.ok) throw new Error("Failed to load categories");
  return r.json();
}

export type ProductBrandRow = {
  name: string;
  slug: string;
  product_count: number;
};

export async function fetchProductBrands(): Promise<ProductBrandRow[]> {
  const r = await fetch(`${API_BASE}/api/products/brands`, {
    next: { revalidate: 60 },
  });
  if (!r.ok) throw new Error("Failed to load brands");
  return r.json();
}

export const CATALOG_SORTS = ["newest", "price_asc", "price_desc", "name_asc"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export function parseCatalogSort(raw: string | undefined): CatalogSort {
  const s = raw?.trim();
  if (s === "price_asc" || s === "price_desc" || s === "name_asc" || s === "newest") return s;
  return "newest";
}

/** Optional non-negative price from URL query (undefined if missing/invalid). */
export function parseCatalogPrice(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const t = String(raw).trim();
  if (t === "") return undefined;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export async function fetchProducts(params: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  /** Only products with null or empty category */
  uncategorized?: boolean;
  sort?: CatalogSort;
  minPrice?: number;
  maxPrice?: number;
  /** Only products with an active flash sale */
  onSale?: boolean;
  /** Filter by brand slug from GET /products/brands */
  brandSlug?: string;
}): Promise<{ products: Product[]; total: number; page: number; total_pages: number }> {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.category) sp.set("category", params.category);
  if (params.search) sp.set("search", params.search);
  if (params.uncategorized) sp.set("uncategorized", "true");
  if (params.sort && params.sort !== "newest") sp.set("sort", params.sort);
  if (params.minPrice != null && Number.isFinite(params.minPrice)) sp.set("min_price", String(params.minPrice));
  if (params.maxPrice != null && Number.isFinite(params.maxPrice)) sp.set("max_price", String(params.maxPrice));
  if (params.onSale) sp.set("on_sale", "true");
  if (params.brandSlug?.trim()) sp.set("brand_slug", params.brandSlug.trim());
  const r = await fetch(`${API_BASE}/api/products?${sp.toString()}`, {
    next: { revalidate: 15 },
  });
  if (!r.ok) throw new Error("Failed to load products");
  return r.json();
}

export type ProductSuggestion = {
  id: string;
  name: string;
  category: string | null;
};

export async function fetchProductSuggestions(q: string, signal?: AbortSignal): Promise<ProductSuggestion[]> {
  const t = q.trim();
  if (t.length < 1) return [];
  const sp = new URLSearchParams({ q: t, limit: "8" });
  const r = await fetch(`${API_BASE}/api/products/suggest?${sp.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!r.ok) throw new Error("Failed to load suggestions");
  return r.json();
}

export type ProductReviewEligibility = {
  can_submit_review: boolean;
  reason: "login" | "purchase" | null;
};

export type ReviewSummary = {
  average: number | null;
  count: number;
};

export type ProductReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  image_urls: string[];
  author_name: string;
  created_at: string;
  is_mine: boolean;
  verified_purchase?: boolean;
};

export type ProductReviewListResponse = {
  items: ProductReview[];
  total: number;
  page: number;
  total_pages: number;
  average: number | null;
};

export async function fetchProduct(
  id: string,
): Promise<{
  product: Product;
  similar_products: Product[];
  bought_together: Product[];
  review_summary: ReviewSummary;
  review_eligibility: ProductReviewEligibility;
} | null> {
  const r = await fetch(`${API_BASE}/api/products/${id}`, { next: { revalidate: 15 } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Failed to load product");
  const data = (await r.json()) as {
    product: Product;
    similar_products: Product[];
    bought_together?: Product[];
    review_summary?: ReviewSummary;
    review_eligibility?: ProductReviewEligibility;
  };
  return {
    product: data.product,
    similar_products: data.similar_products,
    bought_together: data.bought_together ?? [],
    review_summary: data.review_summary ?? { average: null, count: 0 },
    review_eligibility: data.review_eligibility ?? { can_submit_review: false, reason: null },
  };
}

export async function fetchProductPriceHistory(
  productId: string,
  days = 90,
): Promise<ProductPriceHistoryResponse | null> {
  const r = await fetch(`${API_BASE}/api/products/${productId}/price-history?days=${days}`, {
    next: { revalidate: 60 },
  });
  if (r.status === 404) return null;
  if (!r.ok) return null;
  return r.json();
}

export type ProductBundleListRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  bundle_price: number;
  list_subtotal: number;
  savings: number;
};

export type ProductBundleItemPublic = {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  product: Product;
};

export type ProductBundleDetail = ProductBundleListRow & {
  items: ProductBundleItemPublic[];
};

export async function fetchProductBundles(): Promise<ProductBundleListRow[]> {
  const r = await fetch(`${API_BASE}/api/product-bundles`, { next: { revalidate: 30 } });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function fetchProductBundle(id: string): Promise<ProductBundleDetail | null> {
  const r = await fetch(`${API_BASE}/api/product-bundles/${id}`, { next: { revalidate: 30 } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function postBundleToCart(token: string, bundleId: string, times = 1): Promise<CartResponse> {
  const r = await fetch(`${API_BASE}/api/cart/bundles/${bundleId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ times }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

/** PDP bundle by stable store code (e.g. REC-… or custom SKU). */
export async function fetchProductByStoreCode(
  code: string,
): Promise<{
  product: Product;
  similar_products: Product[];
  bought_together: Product[];
  review_summary: ReviewSummary;
  review_eligibility: ProductReviewEligibility;
} | null> {
  const enc = encodeURIComponent(code.trim());
  if (!enc) return null;
  const r = await fetch(`${API_BASE}/api/products/by-code/${enc}`, { next: { revalidate: 15 } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Failed to load product");
  const data = (await r.json()) as {
    product: Product;
    similar_products: Product[];
    bought_together?: Product[];
    review_summary?: ReviewSummary;
    review_eligibility?: ProductReviewEligibility;
  };
  return {
    product: data.product,
    similar_products: data.similar_products,
    bought_together: data.bought_together ?? [],
    review_summary: data.review_summary ?? { average: null, count: 0 },
    review_eligibility: data.review_eligibility ?? { can_submit_review: false, reason: null },
  };
}

export async function fetchProductReviewEligibility(
  productId: string,
  token: string | null,
): Promise<ProductReviewEligibility> {
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API_BASE}/api/products/${productId}/reviews/can-submit`, {
    headers,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function fetchProductReviews(productId: string, page = 1): Promise<ProductReviewListResponse> {
  const sp = new URLSearchParams({ page: String(page), limit: "10" });
  const r = await fetch(`${API_BASE}/api/products/${productId}/reviews?${sp}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type ProductReviewUpsertBody = {
  rating: number;
  title?: string | null;
  body?: string | null;
  image_urls?: string[] | null;
};

export async function upsertProductReview(
  token: string,
  productId: string,
  body: ProductReviewUpsertBody,
): Promise<{ review: ProductReview; review_summary: ReviewSummary }> {
  const r = await fetch(`${API_BASE}/api/products/${productId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function deleteMyProductReview(token: string, productId: string): Promise<ReviewSummary> {
  const r = await fetch(`${API_BASE}/api/products/${productId}/reviews/me`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function uploadReviewImage(token: string, file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/auth/me/upload/review-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type ProductQaAnswer = {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
  is_official?: boolean;
};

export type ProductQaItem = {
  id: string;
  question: string;
  asker_name: string;
  created_at: string;
  is_mine: boolean;
  answer: ProductQaAnswer | null;
};

export async function fetchProductQa(productId: string): Promise<ProductQaItem[]> {
  const r = await fetch(`${API_BASE}/api/products/${productId}/qa`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  const data: { items: ProductQaItem[] } = await r.json();
  return data.items;
}

export async function postProductQuestion(token: string, productId: string, body: string): Promise<ProductQaItem[]> {
  const r = await fetch(`${API_BASE}/api/products/${productId}/qa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ body }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  const data: { items: ProductQaItem[] } = await r.json();
  return data.items;
}

export type PriceMatchReport = {
  id: string;
  product_id: string;
  user_id: string | null;
  reporter_email: string | null;
  competitor_url: string | null;
  reported_price: number;
  currency: string;
  notes: string | null;
  storefront_unit_at_submit: number | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

export type PriceMatchReportAdminRow = PriceMatchReport & { product_name?: string | null };

export type PriceMatchReportListResponse = { reports: PriceMatchReportAdminRow[]; total: number };

export type PriceMatchReportCreateBody = {
  reported_price: number;
  currency?: string;
  competitor_url?: string | null;
  notes?: string | null;
  reporter_email?: string | null;
};

export async function postPriceMatchReport(
  productId: string,
  body: PriceMatchReportCreateBody,
  token?: string | null,
): Promise<PriceMatchReport> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API_BASE}/api/products/${productId}/price-match-reports`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminListPriceMatchReports(
  token: string,
  opts?: { status?: string; limit?: number; offset?: number },
): Promise<PriceMatchReportListResponse> {
  const sp = new URLSearchParams();
  if (opts?.status) sp.set("status_filter", opts.status);
  if (opts?.limit != null) sp.set("limit", String(opts.limit));
  if (opts?.offset != null) sp.set("offset", String(opts.offset));
  const q = sp.toString();
  const r = await fetch(`${API_BASE}/api/admin/price-match-reports${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminPatchPriceMatchReport(
  token: string,
  reportId: string,
  body: { status: string; admin_note?: string | null },
): Promise<PriceMatchReport> {
  const r = await fetch(`${API_BASE}/api/admin/price-match-reports/${reportId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type GiftRegistrySummary = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  event_date: string | null;
  created_at: string;
  item_count: number;
};

export type GiftRegistryItemPublic = {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity_requested: number;
  note: string | null;
  sort_order: number;
  product: Product;
};

export type GiftRegistryDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  event_date: string | null;
  created_at: string;
  owner_display_name: string | null;
  items: GiftRegistryItemPublic[];
};

export async function fetchGiftRegistryBySlug(slug: string): Promise<GiftRegistryDetail> {
  const r = await fetch(`${API_BASE}/api/gift-registries/slug/${encodeURIComponent(slug)}`, {
    next: { revalidate: 30 },
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function fetchMyGiftRegistries(token: string): Promise<{ registries: GiftRegistrySummary[] }> {
  const r = await fetch(`${API_BASE}/api/gift-registries/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function fetchGiftRegistryOwned(token: string, registryId: string): Promise<GiftRegistryDetail> {
  const r = await fetch(`${API_BASE}/api/gift-registries/${registryId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function createGiftRegistry(
  token: string,
  body: { title: string; description?: string | null; event_date?: string | null },
): Promise<GiftRegistryDetail> {
  const r = await fetch(`${API_BASE}/api/gift-registries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function updateGiftRegistry(
  token: string,
  registryId: string,
  body: { title?: string; description?: string | null; event_date?: string | null },
): Promise<GiftRegistryDetail> {
  const r = await fetch(`${API_BASE}/api/gift-registries/${registryId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function deleteGiftRegistry(token: string, registryId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/gift-registries/${registryId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (r.status === 204) return;
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
}

export async function addGiftRegistryItem(
  token: string,
  registryId: string,
  body: {
    product_id: string;
    variant_id?: string | null;
    quantity_requested?: number;
    note?: string | null;
  },
): Promise<GiftRegistryDetail> {
  const r = await fetch(`${API_BASE}/api/gift-registries/${registryId}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function removeGiftRegistryItem(
  token: string,
  registryId: string,
  itemId: string,
): Promise<GiftRegistryDetail> {
  const r = await fetch(`${API_BASE}/api/gift-registries/${registryId}/items/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function postAdminProductQaAnswer(
  token: string,
  productId: string,
  questionId: string,
  body: string,
): Promise<ProductQaItem> {
  const r = await fetch(`${API_BASE}/api/admin/products/${productId}/qa/${questionId}/answer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ body }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function deleteAdminProductQuestion(
  token: string,
  productId: string,
  questionId: string,
): Promise<void> {
  const r = await fetch(`${API_BASE}/api/admin/products/${productId}/qa/${questionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
}

export type AdminAnalytics = {
  total_users: number;
  total_products: number;
  total_views: number;
  total_clicks: number;
  total_purchases: number;
  total_orders: number;
  revenue: number;
  ctr: number;
  note: string;
};

export type Readiness = {
  status: string;
  version: string;
  checks: { database: string; redis: string };
};

export async function fetchReadiness(): Promise<Readiness> {
  const r = await fetch(`${API_BASE}/health/ready`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function fetchAdminAnalytics(token: string): Promise<AdminAnalytics> {
  const r = await fetch(`${API_BASE}/api/admin/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || "Failed to load analytics");
  }
  return r.json();
}

/** Upsert rows for admin product create/update (order = sort_order index). */
export type AdminProductVariantUpsert = {
  id?: string | null;
  label: string;
  price: number;
  stock: number;
  sort_order?: number;
  options?: Record<string, string> | null;
};

export type AdminProductCreate = {
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  brand?: string | null;
  tags?: string[] | null;
  image_url?: string | null;
  video_url?: string | null;
  stock?: number;
  sale_price?: number | null;
  sale_ends_at?: string | null;
  product_code?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  /** JSON array of A+ modules; omit or [] for none */
  a_plus_modules?: Record<string, unknown>[] | null;
  is_hazardous?: boolean;
  minimum_age?: number | null;
  compliance_note?: string | null;
  /** Quantity breaks; omit or empty = none */
  volume_tiers?: VolumeTier[] | null;
  /** Optional — create product with SKU rows in one request */
  variants?: AdminProductVariantUpsert[];
};

export type AdminProductUpdate = Partial<AdminProductCreate> & {
  variants?: AdminProductVariantUpsert[];
};

export async function adminUploadProductImage(token: string, file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/admin/upload/product-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminCreateProduct(token: string, body: AdminProductCreate): Promise<Product> {
  const r = await fetch(`${API_BASE}/api/admin/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...body, stock: body.stock ?? 0 }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminUpdateProduct(
  token: string,
  productId: string,
  body: AdminProductUpdate,
): Promise<Product> {
  const r = await fetch(`${API_BASE}/api/admin/products/${productId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminDeleteProduct(token: string, productId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/admin/products/${productId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 204) return;
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
}

export type ProductGalleryRow = { id: string; image_url: string; sort_order: number };

export type AdminProductDetail = { product: Product; images: ProductGalleryRow[] };

export async function adminGetProductDetail(token: string, productId: string): Promise<AdminProductDetail> {
  const r = await fetch(`${API_BASE}/api/admin/products/${productId}/detail`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminAddProductGalleryImage(
  token: string,
  productId: string,
  imageUrl: string,
): Promise<AdminProductDetail> {
  const r = await fetch(`${API_BASE}/api/admin/products/${productId}/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image_url: imageUrl }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminDeleteProductGalleryImage(
  token: string,
  productId: string,
  imageId: string,
): Promise<AdminProductDetail> {
  const r = await fetch(`${API_BASE}/api/admin/products/${productId}/images/${imageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminReorderProductGallery(
  token: string,
  productId: string,
  imageIds: string[],
): Promise<AdminProductDetail> {
  const r = await fetch(`${API_BASE}/api/admin/products/${productId}/images/order`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image_ids: imageIds }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function postEvent(
  token: string,
  body: { product_id: string; event_type: string; metadata?: Record<string, unknown> },
) {
  const r = await fetch(`${API_BASE}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || "Event failed");
  }
  return r.json();
}

export type CartResponse = {
  items: {
    product: Product;
    quantity: number;
    variant_id?: string | null;
    variant_label?: string | null;
    unit_price: number;
    list_unit_price?: number | null;
    bundle_id?: string | null;
    bundle_group_id?: string | null;
    bundle_name?: string | null;
  }[];
  item_count: number;
  merchandise_subtotal?: number;
};

export async function fetchCart(token: string): Promise<CartResponse> {
  const r = await fetch(`${API_BASE}/api/cart`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function postCartItem(
  token: string,
  productId: string,
  quantity: number,
  variantId?: string | null,
): Promise<CartResponse> {
  const body: Record<string, unknown> = { product_id: productId, quantity };
  if (variantId) body.variant_id = variantId;
  const r = await fetch(`${API_BASE}/api/cart/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function patchCartItem(
  token: string,
  productId: string,
  quantity: number,
  variantId?: string | null,
  bundleGroupId?: string | null,
): Promise<CartResponse> {
  const qs = new URLSearchParams();
  if (variantId) qs.set("variant_id", variantId);
  if (bundleGroupId) qs.set("bundle_group_id", bundleGroupId);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  const r = await fetch(`${API_BASE}/api/cart/items/${productId}${q}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ quantity }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function deleteCartItem(
  token: string,
  productId: string,
  variantId?: string | null,
  bundleGroupId?: string | null,
): Promise<CartResponse> {
  const qs = new URLSearchParams();
  if (variantId) qs.set("variant_id", variantId);
  if (bundleGroupId) qs.set("bundle_group_id", bundleGroupId);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  const r = await fetch(`${API_BASE}/api/cart/items/${productId}${q}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type OrderTrackingStep = {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
  at: string | null;
};

export type OrderPublic = {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  payment_method: string | null;
  gift_wrap: boolean;
  gift_message: string | null;
  promo_code?: string | null;
  promo_discount?: number | null;
  loyalty_points_redeemed?: number | null;
  loyalty_discount?: number | null;
  loyalty_points_earned?: number | null;
  gift_card_code?: string | null;
  gift_card_discount?: number | null;
  tracking_carrier?: string | null;
  tracking_number?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  tracking_steps?: OrderTrackingStep[];
  created_at: string;
  items: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    variant_id?: string | null;
    variant_label?: string | null;
  }[];
};

export type OrderCheckoutOptions = {
  payment_method?: string;
  gift_wrap?: boolean;
  gift_message?: string | null;
  promo_code?: string | null;
  redeem_loyalty_points?: number | null;
  gift_card_code?: string | null;
  gift_cards_recipient_email?: string | null;
  gift_cards_message?: string | null;
  /** Ask backend to prefill Stripe email (requires express_checkout_enabled on the user). */
  express_checkout?: boolean;
};

export type PromoPreviewResponse = {
  valid: boolean;
  error?: string | null;
  subtotal: number;
  discount: number;
  merch_after_discount: number;
  gift_wrap_fee: number;
};

export async function previewPromoCode(
  token: string,
  body: {
    code: string;
    items: { product_id: string; quantity: number; variant_id?: string | null }[];
  },
): Promise<PromoPreviewResponse> {
  const r = await fetch(`${API_BASE}/api/promos/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type LoyaltyPreviewResponse = {
  valid: boolean;
  error?: string | null;
  subtotal: number;
  promo_discount: number;
  merch_after_promo: number;
  balance: number;
  redeem_points_used: number;
  loyalty_discount: number;
  merch_after_loyalty: number;
  points_earned_if_completed: number;
  gift_wrap_fee: number;
  redeem_points_per_dollar: number;
  earn_points_per_dollar: number;
};

export async function previewLoyalty(
  token: string,
  body: {
    items: { product_id: string; quantity: number; variant_id?: string | null }[];
    promo_code?: string | null;
    redeem_loyalty_points?: number;
  },
): Promise<LoyaltyPreviewResponse> {
  const r = await fetch(`${API_BASE}/api/loyalty/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: body.items,
      promo_code: body.promo_code?.trim() ? body.promo_code.trim().toUpperCase() : null,
      redeem_loyalty_points: body.redeem_loyalty_points ?? 0,
    }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type GiftCardPreviewResponse = {
  valid: boolean;
  error?: string | null;
  subtotal: number;
  promo_discount: number;
  merch_after_promo: number;
  loyalty_discount: number;
  merch_after_loyalty: number;
  gift_card_discount: number;
  merch_after_gift_card: number;
  gift_wrap_fee: number;
  gift_card_balance?: number | null;
};

export async function previewGiftCard(
  token: string,
  body: {
    items: { product_id: string; quantity: number; variant_id?: string | null }[];
    promo_code?: string | null;
    redeem_loyalty_points?: number;
    gift_card_code?: string | null;
  },
): Promise<GiftCardPreviewResponse> {
  const r = await fetch(`${API_BASE}/api/gift-cards/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: body.items,
      promo_code: body.promo_code?.trim() ? body.promo_code.trim().toUpperCase() : null,
      redeem_loyalty_points: body.redeem_loyalty_points ?? 0,
      gift_card_code: body.gift_card_code?.trim() ? body.gift_card_code.trim() : null,
    }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type GiftCardMine = {
  id: string;
  code: string;
  balance_remaining: number;
  face_value: number;
  recipient_email?: string | null;
  created_at: string;
  issuer_order_id: string;
};

export async function fetchMyGiftCards(token: string): Promise<GiftCardMine[]> {
  const r = await fetch(`${API_BASE}/api/gift-cards/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function postOrder(
  token: string,
  items: {
    product_id: string;
    quantity: number;
    variant_id?: string | null;
    bundle_group_id?: string | null;
    bundle_id?: string | null;
  }[],
  options: OrderCheckoutOptions = {},
): Promise<OrderPublic> {
  const {
    payment_method = "direct",
    gift_wrap = false,
    gift_message = null,
    promo_code = null,
    redeem_loyalty_points = null,
    gift_card_code = null,
    gift_cards_recipient_email = null,
    gift_cards_message = null,
  } = options;
  const r = await fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items,
      payment_method,
      gift_wrap,
      gift_message: gift_message?.trim() ? gift_message.trim() : null,
      promo_code: promo_code?.trim() ? promo_code.trim().toUpperCase() : null,
      redeem_loyalty_points: redeem_loyalty_points != null && redeem_loyalty_points > 0 ? redeem_loyalty_points : null,
      gift_card_code: gift_card_code?.trim() ? gift_card_code.trim() : null,
      gift_cards_recipient_email: gift_cards_recipient_email?.trim() ? gift_cards_recipient_email.trim() : null,
      gift_cards_message: gift_cards_message?.trim() ? gift_cards_message.trim() : null,
    }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type PaymentStatus = { stripe_checkout_available: boolean };

export async function fetchPaymentStatus(): Promise<PaymentStatus> {
  const r = await fetch(`${API_BASE}/api/payments/status`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function createStripeCheckoutSession(
  token: string,
  items: {
    product_id: string;
    quantity: number;
    variant_id?: string | null;
    bundle_group_id?: string | null;
    bundle_id?: string | null;
  }[],
  options: Pick<
    OrderCheckoutOptions,
    | "gift_wrap"
    | "gift_message"
    | "promo_code"
    | "redeem_loyalty_points"
    | "gift_card_code"
    | "gift_cards_recipient_email"
    | "gift_cards_message"
    | "express_checkout"
  > = {},
): Promise<{ url: string }> {
  const {
    gift_wrap = false,
    gift_message = null,
    promo_code = null,
    redeem_loyalty_points = null,
    gift_card_code = null,
    gift_cards_recipient_email = null,
    gift_cards_message = null,
    express_checkout = false,
  } = options;
  const r = await fetch(`${API_BASE}/api/payments/create-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items,
      gift_wrap,
      gift_message: gift_message?.trim() ? gift_message.trim() : null,
      promo_code: promo_code?.trim() ? promo_code.trim().toUpperCase() : null,
      redeem_loyalty_points: redeem_loyalty_points != null && redeem_loyalty_points > 0 ? redeem_loyalty_points : null,
      gift_card_code: gift_card_code?.trim() ? gift_card_code.trim() : null,
      gift_cards_recipient_email: gift_cards_recipient_email?.trim() ? gift_cards_recipient_email.trim() : null,
      gift_cards_message: gift_cards_message?.trim() ? gift_cards_message.trim() : null,
      express_checkout: !!express_checkout,
    }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function syncStripeCheckoutSession(token: string, session_id: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/payments/sync-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ session_id }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
}

export type OrderHistoryFilters = {
  limit?: number;
  status?: string;
  payment_method?: string;
  q?: string;
  from_date?: string;
  to_date?: string;
  min_total?: number;
  max_total?: number;
};

export async function fetchMyOrders(
  token: string,
  filters: OrderHistoryFilters = {},
): Promise<OrderPublic[]> {
  const params = new URLSearchParams();
  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.status?.trim()) params.set("status", filters.status.trim());
  if (filters.payment_method?.trim()) params.set("payment_method", filters.payment_method.trim());
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.from_date?.trim()) params.set("from_date", filters.from_date.trim());
  if (filters.to_date?.trim()) params.set("to_date", filters.to_date.trim());
  if (filters.min_total != null && !Number.isNaN(filters.min_total)) params.set("min_total", String(filters.min_total));
  if (filters.max_total != null && !Number.isNaN(filters.max_total)) params.set("max_total", String(filters.max_total));
  const qs = params.toString();
  const r = await fetch(`${API_BASE}/api/orders/me${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function downloadOrderInvoice(token: string, orderId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/orders/${orderId}/invoice`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${orderId.slice(0, 8)}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function cancelOrder(token: string, orderId: string): Promise<OrderPublic> {
  const r = await fetch(`${API_BASE}/api/orders/${orderId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function adminListOrders(
  token: string,
  params: { limit?: number; status?: string } = {},
): Promise<OrderPublic[]> {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.status?.trim()) sp.set("status", params.status.trim());
  const qs = sp.toString();
  const r = await fetch(`${API_BASE}/api/admin/orders${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type AdminShipmentPatch = {
  tracking_carrier?: string | null;
  tracking_number?: string | null;
  mark_shipped?: boolean;
  mark_delivered?: boolean;
};

export async function adminPatchOrderShipment(
  token: string,
  orderId: string,
  body: AdminShipmentPatch,
): Promise<OrderPublic> {
  const r = await fetch(`${API_BASE}/api/admin/orders/${orderId}/shipment`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}
