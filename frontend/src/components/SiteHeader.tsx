"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { User } from "@/lib/api";
import { API_BASE, fetchCart, getToken, setToken } from "@/lib/api";
import { CART_CHANGED_EVENT, cartItemCount } from "@/lib/cart";

const navClass =
  "rounded-lg px-2 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-zinc-800 dark:hover:text-white";

export function SiteHeader() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      queueMicrotask(() => {
        setUser(null);
      });
      return;
    }
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: User | null) => setUser(u))
      .catch(() => setUser(null));
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
          className="group flex items-center gap-2 text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-700 text-xs font-bold text-white shadow-md shadow-teal-500/20">
            R
          </span>
          <span className="group-hover:text-teal-700 dark:group-hover:text-teal-400">RecEngine</span>
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
