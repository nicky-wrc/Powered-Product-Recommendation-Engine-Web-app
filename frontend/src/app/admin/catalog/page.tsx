"use client";

import Link from "next/link";

import { AdminProductManager } from "@/components/AdminProductManager";
import { getToken } from "@/lib/api";

export default function AdminCatalogPage() {
  const token = getToken();
  if (!token) {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-400">
        ไม่พบเซสชัน{" "}
        <Link href="/login" className="font-medium text-teal-700 underline dark:text-teal-400">
          เข้าสู่ระบบ
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200/90 bg-white/80 p-5 ring-1 ring-stone-900/[0.03] dark:border-zinc-800 dark:bg-zinc-950/80">
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-50">เพิ่มสินค้าใหม่</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          ฟอร์มสร้างรายการเท่านั้น — จัดการสต็อกและแก้ไขรายการทั้งหมดอยู่ที่ «สต็อกสินค้า»
        </p>
      </div>
      <AdminProductManager token={token} mode="create" />
    </div>
  );
}
