"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, startTransition, type ReactNode } from "react";

type NavIconName = "dashboard" | "plus" | "stock" | "orders";

type NavItem = { href: string; label: string; icon: NavIconName };

type NavGroup = { heading: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    heading: "หลัก",
    items: [{ href: "/admin", label: "ภาพรวม", icon: "dashboard" }],
  },
  {
    heading: "จัดการ",
    items: [
      { href: "/admin/catalog", label: "เพิ่มสินค้าใหม่", icon: "plus" },
      { href: "/admin/inventory", label: "สต็อกสินค้า", icon: "stock" },
      { href: "/admin/orders", label: "คำสั่งซื้อ & ขนส่ง", icon: "orders" },
    ],
  },
];

function NavIcon({ name }: { name: NavIconName }) {
  const common = "h-5 w-5 shrink-0 opacity-80";
  if (name === "dashboard") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75A2.25 2.25 0 0115.75 13.5H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25zM13.5 6A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25A2.25 2.25 0 0110.5 15.75V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25z"
        />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    );
  }
  if (name === "orders") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
        />
      </svg>
    );
  }
  return (
    <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );
}

function breadcrumbFor(pathname: string): { title: string; crumbs: { label: string; href?: string }[] } {
  if (pathname.startsWith("/admin/catalog")) {
    return {
      title: "เพิ่มสินค้าใหม่",
      crumbs: [
        { label: "แอดมิน", href: "/admin" },
        { label: "เพิ่มสินค้า" },
      ],
    };
  }
  if (pathname.startsWith("/admin/inventory")) {
    return {
      title: "สต็อกสินค้า",
      crumbs: [
        { label: "แอดมิน", href: "/admin" },
        { label: "สต็อก" },
      ],
    };
  }
  if (pathname.startsWith("/admin/orders")) {
    return {
      title: "คำสั่งซื้อ & ขนส่ง",
      crumbs: [
        { label: "แอดมิน", href: "/admin" },
        { label: "คำสั่งซื้อ" },
      ],
    };
  }
  return {
    title: "ภาพรวม",
    crumbs: [{ label: "แอดมิน" }],
  };
}

export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname() || "/admin";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { title, crumbs } = breadcrumbFor(pathname);

  useEffect(() => {
    startTransition(() => setSidebarOpen(false));
  }, [pathname]);

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="ปิดเมนู"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={[
          "fixed bottom-0 left-0 top-0 z-50 flex w-64 flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-300 transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-zinc-800 px-4">
          <Link href="/admin" className="text-sm font-semibold tracking-tight text-white">
            แดชบอร์ดแอดมิน
          </Link>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 text-sm">
          {NAV.map((group) => (
            <div key={group.heading}>
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{group.heading}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    item.href === "/admin"
                      ? pathname === "/admin" || pathname === "/admin/"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={[
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors",
                          active
                            ? "bg-zinc-800 text-white shadow-sm ring-1 ring-zinc-700/80"
                            : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100",
                        ].join(" ")}
                      >
                        <NavIcon name={item.icon} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-zinc-800 p-3">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">เข้าสู่ระบบ</p>
          <p className="mt-1 truncate px-2 text-xs text-zinc-400" title={email}>
            {email}
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-stone-200/90 bg-white/95 px-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <button
            type="button"
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-expanded={sidebarOpen}
            aria-label="เปิดเมนู"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <nav className="text-xs text-stone-500 dark:text-zinc-500">
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`}>
                  {i > 0 ? <span className="mx-1.5 text-stone-300 dark:text-zinc-600">/</span> : null}
                  {c.href ? (
                    <Link href={c.href} className="hover:text-teal-700 dark:hover:text-teal-400">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-stone-700 dark:text-zinc-300">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <h1 className="truncate text-lg font-bold text-stone-900 dark:text-stone-50">{title}</h1>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            กลับหน้าร้าน
          </Link>
        </header>

        <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
