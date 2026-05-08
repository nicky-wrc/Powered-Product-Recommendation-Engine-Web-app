"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import {
  API_BASE,
  deleteCartItem,
  fetchCart,
  formatNetworkError,
  getToken,
  patchCartItem,
  postOrder,
  productImageUrl,
} from "@/lib/api";
import { CART_CHANGED_EVENT, cartSubtotal, clearCart, getCart, removeLine, updateLineQty } from "@/lib/cart";

type Line = {
  product_id: string;
  name: string;
  price: number;
  image_url: string | null;
  qty: number;
};

export default function CartPage() {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      void (async () => {
        const t = getToken();
        if (t) {
          try {
            const c = await fetchCart(t);
            setLines(
              c.items.map((i) => ({
                product_id: i.product.id,
                name: i.product.name,
                price: i.product.price,
                image_url: i.product.image_url,
                qty: i.quantity,
              })),
            );
          } catch {
            setLines(getCart());
          }
        } else {
          setLines(getCart());
        }
      })();
    };
    queueMicrotask(sync);
    window.addEventListener(CART_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CART_CHANGED_EVENT, sync);
  }, []);

  async function bumpQty(line: Line, delta: number) {
    const t = getToken();
    const next = line.qty + delta;
    setErr(null);
    try {
      if (t) {
        if (next < 1) await deleteCartItem(t, line.product_id);
        else await patchCartItem(t, line.product_id, next);
      } else {
        if (next < 1) removeLine(line.product_id);
        else updateLineQty(line.product_id, next);
      }
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function remove(line: Line) {
    const t = getToken();
    setErr(null);
    try {
      if (t) await deleteCartItem(t, line.product_id);
      else removeLine(line.product_id);
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function checkout() {
    const token = getToken();
    if (!token) {
      router.push("/login?next=/cart");
      return;
    }
    if (lines.length === 0) return;
    setErr(null);
    setBusy(true);
    try {
      await postOrder(
        token,
        lines.map((l) => ({ product_id: l.product_id, quantity: l.qty })),
      );
      clearCart();
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
      setLines([]);
      router.push("/orders");
      router.refresh();
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  const subtotal = cartSubtotal(lines);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Cart</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Signed-in users: cart lives in the database. Checkout creates an <strong>order</strong>, decreases stock, and
            records purchase signals. Guests: items stay in this browser until you log in (then they merge to your
            server cart).
          </p>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your cart is empty.{" "}
            <Link href="/products" className="font-medium text-zinc-900 underline dark:text-zinc-100">
              Browse catalog
            </Link>
          </p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
              {lines.map((line) => {
                const displaySrc = productImageUrl({
                  id: line.product_id,
                  name: line.name,
                  description: null,
                  price: line.price,
                  category: null,
                  tags: null,
                  image_url: line.image_url,
                  stock: 0,
                });
                return (
                  <li key={line.product_id} className="flex gap-4 p-4">
                    <Link
                      href={`/products/${line.product_id}`}
                      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900"
                    >
                      {displaySrc ? (
                        <Image src={displaySrc} alt="" fill className="object-cover" sizes="96px" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs text-zinc-400">No image</span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link
                          href={`/products/${line.product_id}`}
                          className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                        >
                          {line.name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void remove(line)}
                          className="text-xs text-red-600 hover:underline dark:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        ${line.price.toFixed(2)} each · line ${(line.price * line.qty).toFixed(2)}
                      </p>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="sr-only">Quantity</span>
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-600"
                            onClick={() => void bumpQty(line, -1)}
                          >
                            −
                          </button>
                          <span className="w-8 text-center tabular-nums">{line.qty}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-600"
                            onClick={() => void bumpQty(line, 1)}
                          >
                            +
                          </button>
                        </label>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Subtotal · ${subtotal.toFixed(2)}
              </p>
              <div className="flex flex-col gap-2 sm:items-end">
                {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void checkout()}
                  className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {busy ? "Placing order…" : "Place order (demo)"}
                </button>
                <p className="text-xs text-zinc-500">
                  Requires login. API <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">{API_BASE}</code>
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
