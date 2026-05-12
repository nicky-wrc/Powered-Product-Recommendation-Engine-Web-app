"use client";

import Link from "next/link";

import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminGate } from "@/components/admin/useAdminGate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { me, err, loading } = useAdminGate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-zinc-950">
        <p className="text-sm text-stone-600 dark:text-stone-400">กำลังโหลด…</p>
      </div>
    );
  }

  if (err || !me?.is_admin) {
    return (
      <div className="min-h-screen bg-stone-100 px-4 py-16 dark:bg-zinc-950">
        <div className="mx-auto max-w-lg rounded-2xl border border-amber-200/90 bg-amber-50/90 p-6 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {err ?? "ไม่มีสิทธิ์แอดมิน"}{" "}
          <Link href="/login" className="font-semibold text-teal-800 underline dark:text-teal-300">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  return <AdminShell email={me.email}>{children}</AdminShell>;
}
