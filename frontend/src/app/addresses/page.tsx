"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, startTransition } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { useAppModal } from "@/components/AppModalProvider";
import {
  createUserAddress,
  deleteUserAddress,
  fetchMe,
  fetchUserAddresses,
  formatNetworkError,
  getToken,
  setDefaultUserAddress,
  updateUserAddress,
  type UserAddress,
} from "@/lib/api";
import { THAI_PROVINCES, THAI_PROVINCE_DATALIST_ID } from "@/lib/thaiProvinces";
import { safeInternalNextPath } from "@/lib/shippingAddress";

function emptyForm() {
  return {
    label: "",
    recipient_name: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    province: "",
    postal_code: "",
    country: "",
    is_default: false,
  };
}

export default function AddressesPage() {
  const router = useRouter();
  const { confirm } = useAppModal();
  const [rows, setRows] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [returnAfter, setReturnAfter] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = getToken();
    if (!t) return;
    setErr(null);
    try {
      const list = await fetchUserAddresses(t);
      setRows(list);
    } finally {
      queueMicrotask(() => setLoading(false));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const n = safeInternalNextPath(new URLSearchParams(window.location.search).get("next"));
    startTransition(() => setReturnAfter(n));
  }, []);

  useEffect(() => {
    const t = getToken();
    const search = typeof window !== "undefined" ? window.location.search : "";
    const addressesPath = "/addresses" + search;
    if (!t) {
      startTransition(() => {
        setLoading(false);
        router.replace("/login?next=" + encodeURIComponent(addressesPath));
      });
      return;
    }
    startTransition(() => {
      void load().catch(() => router.replace("/login?next=" + encodeURIComponent(addressesPath)));
    });
  }, [load, router]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setErr(null);
    setOk(null);
  }

  function startEdit(a: UserAddress) {
    setEditingId(a.id);
    setForm({
      label: a.label ?? "",
      recipient_name: a.recipient_name ?? "",
      phone: a.phone ?? "",
      address_line1: a.address_line1,
      address_line2: a.address_line2 ?? "",
      city: a.city ?? "",
      province: a.province ?? "",
      postal_code: a.postal_code ?? "",
      country: a.country ?? "",
      is_default: a.is_default,
    });
    setShowForm(true);
    setErr(null);
    setOk(null);
  }

  async function fillFromProfile() {
    const t = getToken();
    if (!t) return;
    setErr(null);
    try {
      const u = await fetchMe(t);
      setForm((f) => ({
        ...f,
        recipient_name: f.recipient_name || u.name || "",
        phone: f.phone || u.phone || "",
        address_line1: f.address_line1 || u.address_line1 || "",
        address_line2: f.address_line2 || u.address_line2 || "",
        city: f.city || u.city || "",
        province: f.province || u.province || "",
        postal_code: f.postal_code || u.postal_code || "",
        country: f.country || u.country || "",
      }));
      setOk("ดึงข้อมูลจากโปรไฟล์แล้ว — ตรวจก่อนบันทึก");
    } catch (e) {
      setErr(formatNetworkError(e));
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const t = getToken();
    if (!t) return;
    const line1 = form.address_line1.trim();
    if (!line1) {
      setErr("กรุณากรอกที่อยู่บรรทัด 1");
      return;
    }
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      if (editingId) {
        await updateUserAddress(t, editingId, {
          label: form.label.trim() || null,
          recipient_name: form.recipient_name.trim() || null,
          phone: form.phone.trim() || null,
          address_line1: line1,
          address_line2: form.address_line2.trim() || null,
          city: form.city.trim() || null,
          province: form.province.trim() || null,
          postal_code: form.postal_code.trim() || null,
          country: form.country.trim() || null,
          is_default: form.is_default,
        });
      } else {
        await createUserAddress(t, {
          label: form.label.trim() || null,
          recipient_name: form.recipient_name.trim() || null,
          phone: form.phone.trim() || null,
          address_line1: line1,
          address_line2: form.address_line2.trim() || null,
          city: form.city.trim() || null,
          province: form.province.trim() || null,
          postal_code: form.postal_code.trim() || null,
          country: form.country.trim() || null,
          is_default: form.is_default,
        });
      }
      await load();
      setOk(editingId ? "อัปเดตที่อยู่แล้ว" : "เพิ่มที่อยู่แล้ว");
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(id: string) {
    const t = getToken();
    if (!t) return;
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      await setDefaultUserAddress(t, id);
      await load();
      setOk("ตั้งเป็นที่อยู่หลักแล้ว");
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "ลบที่อยู่",
      message: "ลบที่อยู่นี้?",
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    const t = getToken();
    if (!t) return;
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      await deleteUserAddress(t, id);
      await load();
      setOk("ลบที่อยู่แล้ว");
    } catch (e) {
      setErr(formatNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
        <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 dark:border-zinc-800 dark:bg-zinc-950/70">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">สมุดที่อยู่</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            เก็บหลายที่อยู่และเลือก<strong>ที่อยู่หลัก</strong>สำหรับจัดส่ง — ต้องมีอย่างน้อยหนึ่งที่อยู่ก่อนสั่งซื้อจากตะกร้า
          </p>
          {returnAfter ? (
            <div className="mt-4 rounded-xl border border-teal-200/90 bg-teal-50/80 px-4 py-3 text-sm text-teal-950 dark:border-teal-800/60 dark:bg-teal-950/30 dark:text-teal-100">
              <p className="font-medium">คุณมาจากขั้นตอนชำระเงิน</p>
              <p className="mt-1 text-teal-900/90 dark:text-teal-200/90">
                กรอกหรือเลือกที่อยู่จัดส่งแล้วกดกลับไปตะกร้าเพื่อสั่งซื้อต่อ
              </p>
              <p className="mt-3">
                <Link
                  href={returnAfter}
                  className="inline-flex rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  กลับไปตะกร้า
                </Link>
              </p>
            </div>
          ) : null}
          <p className="mt-3 text-sm">
            <Link href="/profile" className="font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
              ← โปรไฟล์
            </Link>
          </p>
        </div>

        {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
        {ok ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{ok}</p> : null}

        {loading ? (
          <p className="text-sm text-stone-500">กำลังโหลด…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={startCreate}
                className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-teal-600/25 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-60"
              >
                เพิ่มที่อยู่
              </button>
            </div>

            <ul className="space-y-3">
              {rows.map((a) => (
                <li
                  key={a.id}
                  className="rounded-2xl border border-stone-200/90 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {a.label ? (
                        <p className="font-semibold text-stone-900 dark:text-stone-100">{a.label}</p>
                      ) : null}
                      {a.recipient_name ? (
                        <p className="text-sm text-stone-800 dark:text-stone-200">{a.recipient_name}</p>
                      ) : null}
                      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                        {a.address_line1}
                        {a.address_line2 ? `, ${a.address_line2}` : ""}
                        {a.city || a.province || a.postal_code
                          ? ` — ${[a.city, a.province, a.postal_code].filter(Boolean).join(", ")}`
                          : ""}
                        {a.country ? ` (${a.country})` : ""}
                      </p>
                      {a.phone ? <p className="text-xs text-stone-500 dark:text-stone-500">{a.phone}</p> : null}
                    </div>
                    {a.is_default ? (
                      <span className="shrink-0 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-900 dark:bg-teal-900/40 dark:text-teal-100">
                        ที่อยู่หลัก
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!a.is_default ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void makeDefault(a.id)}
                        className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60 dark:border-zinc-600 dark:text-stone-200 dark:hover:bg-zinc-800"
                      >
                        ตั้งเป็นที่อยู่หลัก
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(a)}
                      className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-60 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-100"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(a.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      ลบ
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {rows.length === 0 && !showForm ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">ยังไม่มีที่อยู่ — กด「เพิ่มที่อยู่」</p>
            ) : null}

            {showForm ? (
              <form
                onSubmit={(e) => void submitForm(e)}
                className="space-y-4 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90"
                noValidate
              >
                <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">
                  {editingId ? "แก้ไขที่อยู่" : "ที่อยู่ใหม่"}
                </h2>
                <datalist id={THAI_PROVINCE_DATALIST_ID}>
                  {THAI_PROVINCES.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void fillFromProfile()}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200"
                  >
                    คัดลอกจากโปรไฟล์
                  </button>
                </div>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ชื่อเรียก (ไม่บังคับ)</span>
                  <input
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="เช่น บ้าน, ออฟฟิศ"
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ชื่อผู้รับ (ไม่บังคับ)</span>
                  <input
                    value={form.recipient_name}
                    onChange={(e) => setForm((f) => ({ ...f, recipient_name: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">โทรศัพท์</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ที่อยู่บรรทัด 1 *</span>
                  <input
                    value={form.address_line1}
                    onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
                    required
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ที่อยู่บรรทัด 2</span>
                  <input
                    value={form.address_line2}
                    onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">เมือง / อำเภอ</span>
                    <input
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">จังหวัด</span>
                    <input
                      list={THAI_PROVINCE_DATALIST_ID}
                      value={form.province}
                      onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">รหัสไปรษณีย์</span>
                  <input
                    value={form.postal_code}
                    onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ประเทศ</span>
                  <input
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                    className="rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-stone-700 dark:text-stone-300">ตั้งเป็นที่อยู่หลัก</span>
                </label>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="cursor-pointer rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setForm(emptyForm());
                      setErr(null);
                    }}
                    className="rounded-xl border border-stone-300 bg-white px-6 py-2.5 text-sm font-semibold text-stone-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200"
                  >
                    ปิดฟอร์ม
                  </button>
                </div>
              </form>
            ) : null}
          </>
        )}

        <p className="text-center text-sm">
          <Link href="/" className="font-medium text-teal-700 underline dark:text-teal-400">
            หน้าแรก
          </Link>
        </p>
      </main>
    </div>
  );
}
