"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { CART_CHANGED_EVENT } from "@/lib/cart";
import { flushLocalCartToServer } from "@/lib/cartSync";
import { API_BASE, formatNetworkError, readApiErrorMessage, setToken } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        setErr(await readApiErrorMessage(r).catch(() => "Invalid email or password"));
        return;
      }
      const data = await r.json();
      setToken(data.access_token);
      try {
        await flushLocalCartToServer(data.access_token);
      } catch {
        /* guest cart merge best-effort */
      }
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
      const next = search.get("next");
      const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.push(safe);
      router.refresh();
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setLoading(false);
    }
  }

  const field =
    "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-stone-900 shadow-inner outline-none ring-teal-500/0 transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-stone-50";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-stone-200/90 bg-white/80 p-8 shadow-xl shadow-stone-900/10 ring-1 ring-stone-900/[0.04] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-black/40">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">Log in</h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          New here?{" "}
          <Link href="/register" className="font-semibold text-teal-700 underline dark:text-teal-400">
            Create an account
          </Link>
        </p>
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-stone-700 dark:text-stone-300">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </label>
          {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Suspense
        fallback={
          <div className="mx-auto max-w-md px-4 py-12 text-sm text-stone-500 dark:text-stone-400">Loading…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
