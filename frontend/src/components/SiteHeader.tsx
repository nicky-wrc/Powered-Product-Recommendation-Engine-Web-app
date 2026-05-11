"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { User } from "@/lib/api";
import { API_BASE, fetchCart, getToken, isLocalUploadImageUrl, PROFILE_UPDATED_EVENT, setToken } from "@/lib/api";
import { CART_CHANGED_EVENT, cartItemCount } from "@/lib/cart";

const navClass =
  "rounded-lg px-2 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-zinc-800 dark:hover:text-white";

function BrandMark() {
  return (
    <span
      className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-cyan-500 via-teal-500 to-emerald-700 text-white shadow-md shadow-teal-600/30 ring-1 ring-white/35 dark:shadow-teal-900/40 dark:ring-white/15"
      aria-hidden
    >
      <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white/25" />
      <svg
        viewBox="0 0 24 24"
        className="relative h-[1.125rem] w-[1.125rem]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="20" r="1.25" />
        <circle cx="18" cy="20" r="1.25" />
        <path d="M2.05 3.05h2.6l1.9 9.55a1.75 1.75 0 0 0 1.72 1.41h9.36a1.75 1.75 0 0 0 1.72-1.37l1.45-6.59H5.65" />
      </svg>
    </span>
  );
}

export function SiteHeader() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [cartCount, setCartCount] = useState(0);

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
    window.addEventListener(PROFILE_UPDATED_EVENT, loadUser);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_UPDATED_EVENT, loadUser);
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

  function logout() {
    setToken(null);
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/75 shadow-sm backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          aria-label="NickyShopEngine home"
          className="group flex min-w-0 max-w-[calc(100vw-11rem)] items-center gap-2 text-sm font-semibold tracking-tight text-stone-900 sm:max-w-none dark:text-stone-50"
        >
          <BrandMark />
          <span className="truncate text-xs font-semibold leading-tight sm:text-sm group-hover:text-teal-700 dark:group-hover:text-teal-400">
            NickyShopEngine
          </span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <Link href="/products" className={navClass}>
            Catalog
          </Link>
          <Link href="/cart" className={`${navClass} inline-flex items-center gap-1`}>
            Cart
            {cartCount > 0 ? (
              <span className="min-w-[1.25rem] rounded-full bg-teal-600 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white dark:bg-teal-500">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </Link>
          {user ? (
            <Link href="/profile" className={navClass}>
              Profile
            </Link>
          ) : null}
          {user ? (
            <Link href="/orders" className={navClass}>
              Orders
            </Link>
          ) : null}
          {user?.is_admin ? (
            <Link href="/admin" className={navClass}>
              Admin
            </Link>
          ) : null}
          {user ? (
            <>
              {user.avatar_url ? (
                <span className="relative hidden h-8 w-8 shrink-0 overflow-hidden rounded-full border border-stone-200 dark:border-zinc-600 sm:block">
                  <Image
                    src={user.avatar_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="32px"
                    unoptimized={isLocalUploadImageUrl(user.avatar_url)}
                  />
                </span>
              ) : null}
              <span
                className="hidden max-w-[9rem] truncate text-xs text-stone-500 sm:inline"
                title={user.email}
              >
                {user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-zinc-700 dark:text-stone-200 dark:hover:bg-zinc-900"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={navClass}>
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-teal-600/25 hover:from-teal-500 hover:to-emerald-500"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
