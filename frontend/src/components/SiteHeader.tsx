"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { User } from "@/lib/api";
import { API_BASE, fetchCart, getToken, setToken } from "@/lib/api";
import { CART_CHANGED_EVENT, cartItemCount } from "@/lib/cart";

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
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          RecEngine
        </Link>
        <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-300">
          <Link href="/products" className="hover:text-zinc-900 dark:hover:text-white">
            Catalog
          </Link>
          <Link href="/cart" className="hover:text-zinc-900 dark:hover:text-white">
            Cart
            {cartCount > 0 ? (
              <span className="ml-1 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </Link>
          {user ? (
            <Link href="/orders" className="hover:text-zinc-900 dark:hover:text-white">
              Orders
            </Link>
          ) : null}
          {user?.is_admin ? (
            <Link href="/admin" className="hover:text-zinc-900 dark:hover:text-white">
              Admin
            </Link>
          ) : null}
          {user ? (
            <>
              <span className="max-w-[10rem] truncate text-xs text-zinc-500" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-zinc-900 dark:hover:text-white">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-zinc-900 px-3 py-1 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
