"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { FreeShippingProgress } from "@/components/FreeShippingProgress";
import {
  API_BASE,
  createStripeCheckoutSession,
  deleteCartItem,
  fetchCart,
  fetchPaymentStatus,
  formatNetworkError,
  getToken,
  patchCartItem,
  postCartItem,
  postOrder,
  isLocalUploadImageUrl,
  productImageUrl,
} from "@/lib/api";
import { addOrMergeLine, CART_CHANGED_EVENT, cartSubtotal, clearCart, getCart, removeLine, updateLineQty } from "@/lib/cart";
import {
  addToSavedForLater,
  getSavedForLater,
  removeSavedForLater,
  savedLineAsProduct,
  SAVED_FOR_LATER_CHANGED_EVENT,
  type SavedForLaterLine,
} from "@/lib/saveForLater";

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
  const [saved, setSaved] = useState<SavedForLaterLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stripeAvailable, setStripeAvailable] = useState(false);

  useEffect(() => {
    void fetchPaymentStatus()
      .then((s) => queueMicrotask(() => setStripeAvailable(s.stripe_checkout_available)))
      .catch(() => queueMicrotask(() => setStripeAvailable(false)));
  }, []);

  useEffect(() => {
    const sync = () => queueMicrotask(() => setSaved(getSavedForLater()));
    sync();
    window.addEventListener(SAVED_FOR_LATER_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SAVED_FOR_LATER_CHANGED_EVENT, sync);
  }, []);

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

  async function saveLineForLater(line: Line) {
    const t = getToken();
    setErr(null);
    try {
      addToSavedForLater({
        product_id: line.product_id,
        name: line.name,
        price: line.price,
        image_url: line.image_url,
        qty: line.qty,
      });
      if (t) await deleteCartItem(t, line.product_id);
      else removeLine(line.product_id);
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save for later");
    }
  }

  async function moveSavedToCart(row: SavedForLaterLine) {
    const t = getToken();
    setErr(null);
    try {
      if (t) await postCartItem(t, row.product_id, row.qty);
      else addOrMergeLine(savedLineAsProduct(row), row.qty);
      removeSavedForLater(row.product_id);
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not move to cart");
    }
  }

  function removeSavedRow(row: SavedForLaterLine) {
    removeSavedForLater(row.product_id);
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

  async function payWithStripe() {
    const token = getToken();
    if (!token) {
      router.push("/login?next=/cart");
      return;
    }
    if (lines.length === 0) return;
    setErr(null);
    setBusy(true);
    try {
      const { url } = await createStripeCheckoutSession(
        token,
        lines.map((l) => ({ product_id: l.product_id, quantity: l.qty })),
      );
      window.location.assign(url);
    } catch (e) {
      setErr(formatNetworkError(e));
      setBusy(false);
    }
  }

  const subtotal = cartSubtotal(lines);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">Cart</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Signed-in users: cart syncs to the server. Pay with <strong>Stripe</strong> (test mode) when configured,
            or use <strong>demo checkout</strong> for classwork without keys. Both paths create an order, update stock,
            and record purchase signals. Guests: browser storage until you log in (then merged to the server).
          </p>
        </div>

        {err ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </p>
        ) : null}

        {lines.length === 0 && saved.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Your cart is empty.{" "}
            <Link href="/products" className="font-semibold text-teal-700 underline dark:text-teal-400">
              Browse catalog
            </Link>
          </p>
        ) : (
          <>
            {lines.length > 0 ? (
              <>
                <FreeShippingProgress subtotal={subtotal} />
                <ul className="divide-y divide-stone-200 overflow-hidden rounded-3xl border border-stone-200/90 bg-white/90 shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/90">
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
                            <Image
                              src={displaySrc}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="96px"
                              unoptimized={isLocalUploadImageUrl(line.image_url)}
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-xs text-zinc-400">
                              No image
                            </span>
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
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              <button
                                type="button"
                                onClick={() => void saveLineForLater(line)}
                                className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                              >
                                Save for later
                              </button>
                              <button
                                type="button"
                                onClick={() => void remove(line)}
                                className="text-xs text-red-600 hover:underline dark:text-red-400"
                              >
                                Remove
                              </button>
                            </div>
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

                <div className="flex flex-col gap-4 rounded-3xl border border-stone-200/90 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
                    Subtotal · ${subtotal.toFixed(2)}
                  </p>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                      {stripeAvailable ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void payWithStripe()}
                          className="rounded-xl bg-stone-900 px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                        >
                          {busy ? "Redirecting…" : "Pay with card (Stripe test)"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void checkout()}
                        className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:opacity-60"
                      >
                        {busy ? "Placing order…" : "Place order (demo, no payment)"}
                      </button>
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Requires login · Stripe uses{" "}
                      <a
                        href="https://stripe.com/docs/testing"
                        className="font-medium text-teal-700 underline dark:text-teal-400"
                      >
                        test cards
                      </a>
                      . API{" "}
                      <code className="rounded bg-stone-100 px-1 dark:bg-zinc-900">{API_BASE}</code>
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Your cart is empty.{" "}
                <Link href="/products" className="font-semibold text-teal-700 underline dark:text-teal-400">
                  Browse catalog
                </Link>
              </p>
            )}

            {saved.length > 0 ? (
              <section className="space-y-3 rounded-3xl border border-stone-200/90 bg-amber-50/40 p-6 dark:border-zinc-800 dark:bg-amber-950/20">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">Saved for later</h2>
                  <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                    Stored in this browser only (not synced to your account yet). Move back when you are ready to buy.
                  </p>
                </div>
                <ul className="divide-y divide-stone-200/80 dark:divide-zinc-800">
                  {saved.map((row) => {
                    const displaySrc = productImageUrl({
                      id: row.product_id,
                      name: row.name,
                      description: null,
                      price: row.price,
                      category: null,
                      tags: null,
                      image_url: row.image_url,
                      stock: 0,
                    });
                    return (
                      <li key={row.product_id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                        <Link
                          href={`/products/${row.product_id}`}
                          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900"
                        >
                          {displaySrc ? (
                            <Image
                              src={displaySrc}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="80px"
                              unoptimized={isLocalUploadImageUrl(row.image_url)}
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[10px] text-zinc-400">
                              No image
                            </span>
                          )}
                        </Link>
                        <div className="min-w-0 flex-1 space-y-2">
                          <Link
                            href={`/products/${row.product_id}`}
                            className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                          >
                            {row.name}
                          </Link>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            ${row.price.toFixed(2)} · qty {row.qty}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <button
                              type="button"
                              onClick={() => void moveSavedToCart(row)}
                              className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                            >
                              Move to cart
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSavedRow(row)}
                              className="text-xs text-red-600 hover:underline dark:text-red-400"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
