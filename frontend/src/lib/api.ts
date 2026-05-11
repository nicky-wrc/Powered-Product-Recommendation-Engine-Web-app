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

export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  tags: string[] | null;
  image_url: string | null;
  stock: number;
};

/** True for images stored under our static mount (use with next/image unoptimized in dev/proxy setups). */
export function isLocalUploadImageUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith("/uploads/");
}

/** Stable Picsum URL for dead Unsplash hotlinks (aligned with backend repair_legacy_image_urls). */
export function productImageUrl(product: Product): string | null {
  const u = product.image_url;
  if (!u) return null;
  if (/unsplash\.com/i.test(u)) {
    return `https://picsum.photos/seed/p-${product.id.replace(/-/g, "")}/800/600`;
  }
  if (u.startsWith("/uploads/")) {
    return u;
  }
  return u;
}

export type User = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  avatar_url?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
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
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
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

export const CATALOG_SORTS = ["newest", "price_asc", "price_desc", "name_asc"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export function parseCatalogSort(raw: string | undefined): CatalogSort {
  const s = raw?.trim();
  if (s === "price_asc" || s === "price_desc" || s === "name_asc" || s === "newest") return s;
  return "newest";
}

export async function fetchProducts(params: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  /** Only products with null or empty category */
  uncategorized?: boolean;
  sort?: CatalogSort;
}): Promise<{ products: Product[]; total: number; page: number; total_pages: number }> {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.category) sp.set("category", params.category);
  if (params.search) sp.set("search", params.search);
  if (params.uncategorized) sp.set("uncategorized", "true");
  if (params.sort && params.sort !== "newest") sp.set("sort", params.sort);
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

export async function fetchProduct(
  id: string,
): Promise<{ product: Product; similar_products: Product[]; bought_together: Product[] } | null> {
  const r = await fetch(`${API_BASE}/api/products/${id}`, { next: { revalidate: 15 } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Failed to load product");
  const data = (await r.json()) as {
    product: Product;
    similar_products: Product[];
    bought_together?: Product[];
  };
  return {
    product: data.product,
    similar_products: data.similar_products,
    bought_together: data.bought_together ?? [],
  };
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

export type AdminProductCreate = {
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  tags?: string[] | null;
  image_url?: string | null;
  stock?: number;
};

export type AdminProductUpdate = Partial<AdminProductCreate>;

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
  items: { product: Product; quantity: number }[];
  item_count: number;
};

export async function fetchCart(token: string): Promise<CartResponse> {
  const r = await fetch(`${API_BASE}/api/cart`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function postCartItem(token: string, productId: string, quantity: number): Promise<CartResponse> {
  const r = await fetch(`${API_BASE}/api/cart/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ product_id: productId, quantity }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function patchCartItem(token: string, productId: string, quantity: number): Promise<CartResponse> {
  const r = await fetch(`${API_BASE}/api/cart/items/${productId}`, {
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

export async function deleteCartItem(token: string, productId: string): Promise<CartResponse> {
  const r = await fetch(`${API_BASE}/api/cart/items/${productId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type OrderPublic = {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  payment_method: string | null;
  created_at: string;
  items: { product_id: string; product_name: string; quantity: number; unit_price: number }[];
};

export async function postOrder(
  token: string,
  items: { product_id: string; quantity: number }[],
  payment_method = "demo",
): Promise<OrderPublic> {
  const r = await fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items, payment_method }),
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
  items: { product_id: string; quantity: number }[],
): Promise<{ url: string }> {
  const r = await fetch(`${API_BASE}/api/payments/create-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
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

export async function fetchMyOrders(token: string): Promise<OrderPublic[]> {
  const r = await fetch(`${API_BASE}/api/orders/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}
