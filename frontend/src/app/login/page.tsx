"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { API_BASE, formatNetworkError, readApiErrorMessage, setToken } from "@/lib/api";
import { SiteHeader } from "@/components/SiteHeader";
import { CART_CHANGED_EVENT } from "@/lib/cart";
import { flushLocalCartToServer } from "@/lib/cartSync";

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

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Log in</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        New here?{" "}
        <Link href="/register" className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Create an account
        </Link>
      </p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <Suspense
        fallback={
          <div className="mx-auto max-w-md px-4 py-12 text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
