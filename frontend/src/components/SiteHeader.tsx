"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { User } from "@/lib/api";
import { API_BASE, fetchCart, getToken, isLocalUploadImageUrl, PROFILE_UPDATED_EVENT, setToken } from "@/lib/api";
import { CART_CHANGED_EVENT, cartItemCount } from "@/lib/cart";
import { dumpServerCartToLocal } from "@/lib/cartSync";
import { compareCount, COMPARE_CHANGED_EVENT } from "@/lib/compare";
import { WISHLIST_CHANGED_EVENT, wishlistCount } from "@/lib/wishlist";

const navQuiet =
  "rounded-lg px-3 py-2 text-sm font-medium text-stone-600 outline-none transition hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-teal-500/60 dark:text-stone-300 dark:hover:bg-zinc-800 dark:hover:text-white";

const dropdownItem =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-zinc-800";

/** Served from FastAPI `StaticFiles` at `backend/uploads/logo/` (proxied as `/uploads/...` in dev). */
const BRAND_LOGO_PATH = "/uploads/logo/d93bb3e1-ccda-4305-badf-0bb6941439fd.jfif";

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function BrandMark() {
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-stone-900/5 dark:ring-white/10" aria-hidden>
      <Image src={BRAND_LOGO_PATH} alt="" fill className="object-cover" sizes="36px" unoptimized />
    </span>
  );
}

type QuickIconLinkProps = {
  href: string;
  label: string;
  badge: number;
  badgeClass: string;
  children: ReactNode;
};

function QuickIconLink({ href, label, badge, badgeClass, children }: QuickIconLinkProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={badge > 0 ? `${label}, ${badge} items` : label}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200/90 bg-white text-stone-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/80 hover:text-teal-800 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-stone-300 dark:hover:border-teal-800 dark:hover:bg-teal-950/40 dark:hover:text-teal-300"
    >
      {children}
      {badge > 0 ? (
        <span
          className={`absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${badgeClass}`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function SiteHeader() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [headerAvatarNonce, setHeaderAvatarNonce] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [wishCount, setWishCount] = useState(0);
  const [compareN, setCompareN] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const accountWrapRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => {
    setAccountOpen(false);
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadUser = () => {
      const token = getToken();
      if (!token) {
        setUser(null);
        return;
      }
      fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((u: User | null) => {
          if (!cancelled) setUser(u);
        })
        .catch(() => {
          if (!cancelled) setUser(null);
        });
    };
    loadUser();
    const onProfileUpdated = () => {
      setHeaderAvatarNonce((n) => n + 1);
      loadUser();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    };
  }, []);

  useEffect(() => {
    const syncCart = () => {
      const token = getToken();
      if (token) {
        fetchCart(token)
          .then((d) => queueMicrotask(() => setCartCount(d.item_count)))
          .catch(() => queueMicrotask(() => setCartCount(cartItemCount())));
        return;
      }
      queueMicrotask(() => setCartCount(cartItemCount()));
    };
    syncCart();
    window.addEventListener(CART_CHANGED_EVENT, syncCart);
    return () => window.removeEventListener(CART_CHANGED_EVENT, syncCart);
  }, []);

  useEffect(() => {
    const sync = () => queueMicrotask(() => setWishCount(wishlistCount()));
    sync();
    window.addEventListener(WISHLIST_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WISHLIST_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    const sync = () => queueMicrotask(() => setCompareN(compareCount()));
    sync();
    window.addEventListener(COMPARE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COMPARE_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (accountWrapRef.current?.contains(e.target as Node)) return;
      setAccountOpen(false);
    }
    if (accountOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [accountOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setAccountOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    const t = getToken();
    if (t) {
      try {
        await dumpServerCartToLocal(t);
      } catch {
        /* still log out */
      }
    }
    setToken(null);
    setUser(null);
    closeAll();
    queueMicrotask(() => window.dispatchEvent(new Event(CART_CHANGED_EVENT)));
    router.push("/");
    router.refresh();
  }

  const displayName = user?.name?.trim() || user?.email || "";

  return (
    <header className="relative sticky top-0 z-50 border-b border-stone-200/90 bg-white/85 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-zinc-800/90 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-[3.25rem] max-w-6xl items-center gap-3 px-4 sm:h-14 sm:gap-4">
        <Link
          href="/"
          aria-label="NickyShopEngine home"
          className="group flex min-w-0 shrink-0 items-center gap-2.5 rounded-xl pr-1 outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
        >
          <BrandMark />
          <span className="hidden font-semibold tracking-tight text-stone-900 sm:inline sm:max-w-[10rem] sm:truncate md:max-w-none dark:text-stone-50">
            <span className="bg-gradient-to-r from-teal-700 to-emerald-700 bg-clip-text text-transparent dark:from-teal-400 dark:to-emerald-400">
              NickyShopEngine
            </span>
          </span>
        </Link>

        {/* Desktop: primary shop links */}
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Shop">
          <Link href="/products" className={navQuiet}>
            Catalog
          </Link>
          <Link href="/brands" className={navQuiet}>
            Brands
          </Link>
          <Link href="/deals" className={navQuiet}>
            Deals
          </Link>
          <Link href="/gift-cards" className={navQuiet}>
            Gift cards
          </Link>
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
          {/* Quick actions — compact icons */}
          <div className="flex items-center gap-1 sm:gap-1.5" aria-label="Shopping tools">
            <QuickIconLink href="/compare" label="Compare" badge={compareN} badgeClass="bg-violet-600 dark:bg-violet-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
            </QuickIconLink>
            <QuickIconLink href="/wishlist" label="Wishlist" badge={wishCount} badgeClass="bg-rose-500 dark:bg-rose-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            </QuickIconLink>
            <QuickIconLink href="/cart" label="Cart" badge={cartCount} badgeClass="bg-teal-600 dark:bg-teal-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2m4 3 1 11h12" />
                <circle cx="9" cy="20" r="1" />
                <circle cx="18" cy="20" r="1" />
              </svg>
            </QuickIconLink>
          </div>

          {user ? (
            <span
              className="hidden items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-950 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100 xl:inline-flex"
              title="Loyalty points balance"
            >
              <span aria-hidden className="text-amber-600 dark:text-amber-400">
                ⋆
              </span>
              {user.loyalty_points ?? 0}
            </span>
          ) : null}

          {user ? (
            <div className="relative hidden md:block" ref={accountWrapRef}>
              <button
                type="button"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => setAccountOpen((o) => !o)}
                className="flex max-w-[14rem] items-center gap-2 rounded-full border border-stone-200/90 bg-stone-50/90 py-1 pl-1 pr-2.5 text-left shadow-sm transition hover:border-stone-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
              >
                {user.avatar_url ? (
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-white dark:ring-zinc-800">
                    <Image
                      key={`${user.avatar_url}-${headerAvatarNonce}`}
                      src={user.avatar_url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="32px"
                      unoptimized={isLocalUploadImageUrl(user.avatar_url)}
                    />
                  </span>
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-600 dark:bg-zinc-700 dark:text-stone-300">
                    {(displayName || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800 dark:text-stone-100">{displayName}</span>
                <IconChevronDown className={`shrink-0 text-stone-400 transition ${accountOpen ? "rotate-180" : ""}`} />
              </button>
              {accountOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-1.5 w-[min(17rem,calc(100vw-2rem))] origin-top-right rounded-2xl border border-stone-200/90 bg-white py-1.5 shadow-lg shadow-stone-900/10 ring-1 ring-stone-900/5 dark:border-zinc-700 dark:bg-zinc-950 dark:ring-white/10"
                >
                  <div className="border-b border-stone-100 px-3 py-2 dark:border-zinc-800">
                    <p className="truncate text-xs font-semibold text-stone-900 dark:text-stone-100">{displayName}</p>
                    <p className="truncate text-[11px] text-stone-500 dark:text-stone-400">{user.email}</p>
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 xl:hidden">
                      <span aria-hidden>⋆</span> {user.loyalty_points ?? 0} pts
                    </p>
                  </div>
                  <div className="p-1.5">
                    <Link href="/orders" className={dropdownItem} role="menuitem" onClick={() => setAccountOpen(false)}>
                      Orders
                    </Link>
                    <Link href="/profile" className={dropdownItem} role="menuitem" onClick={() => setAccountOpen(false)}>
                      Profile
                    </Link>
                    <Link href="/addresses" className={dropdownItem} role="menuitem" onClick={() => setAccountOpen(false)}>
                      Addresses
                    </Link>
                    <Link href="/settings/notifications" className={dropdownItem} role="menuitem" onClick={() => setAccountOpen(false)}>
                      Alerts
                    </Link>
                    {user.is_admin ? (
                      <Link href="/admin" className={dropdownItem} role="menuitem" onClick={() => setAccountOpen(false)}>
                        Admin
                      </Link>
                    ) : null}
                  </div>
                  <div className="border-t border-stone-100 p-1.5 dark:border-zinc-800">
                    <button type="button" className={`${dropdownItem} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40`} onClick={() => void logout()}>
                      Log out
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login" className={navQuiet}>
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-teal-600/20 transition hover:from-teal-500 hover:to-emerald-500"
              >
                Sign up
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200/90 bg-white text-stone-700 shadow-sm transition hover:bg-stone-50 md:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
            aria-expanded={mobileOpen}
            aria-controls="site-mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <IconMenu className="shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile + tablet full nav panel */}
      {mobileOpen ? (
        <>
          <div className="fixed inset-0 top-[3.25rem] z-40 bg-stone-900/25 backdrop-blur-[2px] sm:top-14 md:hidden" aria-hidden onClick={() => setMobileOpen(false)} />
          <div
            id="site-mobile-nav"
            className="absolute left-0 right-0 top-full z-50 max-h-[min(32rem,calc(100dvh-3.25rem))] overflow-y-auto border-b border-stone-200/90 bg-white/98 shadow-xl dark:border-zinc-800 dark:bg-zinc-950/98 md:hidden"
          >
            <div className="mx-auto max-w-6xl space-y-1 px-4 py-4">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Shop</p>
              <Link href="/products" className={`${dropdownItem} py-2.5`} onClick={closeAll}>
                Catalog
              </Link>
              <Link href="/brands" className={`${dropdownItem} py-2.5`} onClick={closeAll}>
                Brands
              </Link>
              <Link href="/deals" className={`${dropdownItem} py-2.5`} onClick={closeAll}>
                Deals
              </Link>
              <Link href="/gift-cards" className={`${dropdownItem} py-2.5`} onClick={closeAll}>
                Gift cards
              </Link>

              {user ? (
                <>
                  <p className="mt-4 px-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Account</p>
                  <div className="flex items-center gap-3 rounded-xl border border-stone-200/80 bg-stone-50/80 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                    {user.avatar_url ? (
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
                        <Image
                          key={`${user.avatar_url}-m-${headerAvatarNonce}`}
                          src={user.avatar_url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="40px"
                          unoptimized={isLocalUploadImageUrl(user.avatar_url)}
                        />
                      </span>
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-bold dark:bg-zinc-700">
                        {(displayName || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-50">{displayName}</p>
                      <p className="truncate text-xs text-stone-500 dark:text-stone-400">{user.email}</p>
                      <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">⋆ {user.loyalty_points ?? 0} loyalty pts</p>
                    </div>
                  </div>
                  <Link href="/orders" className={dropdownItem} onClick={closeAll}>
                    Orders
                  </Link>
                  <Link href="/profile" className={dropdownItem} onClick={closeAll}>
                    Profile
                  </Link>
                  <Link href="/addresses" className={dropdownItem} onClick={closeAll}>
                    Addresses
                  </Link>
                  <Link href="/settings/notifications" className={dropdownItem} onClick={closeAll}>
                    Alerts
                  </Link>
                  {user.is_admin ? (
                    <Link href="/admin" className={dropdownItem} onClick={closeAll}>
                      Admin
                    </Link>
                  ) : null}
                  <button type="button" className={`${dropdownItem} text-red-700 dark:text-red-400`} onClick={() => void logout()}>
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-4 px-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Account</p>
                  <Link href="/login" className={dropdownItem} onClick={closeAll}>
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    className="mx-1 mt-1 flex justify-center rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md"
                    onClick={closeAll}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}
