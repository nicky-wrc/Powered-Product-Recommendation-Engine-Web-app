"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { useAppModal } from "@/components/AppModalProvider";
import {
  changePassword,
  deleteProfileAvatar,
  fetchMe,
  formatNetworkError,
  getToken,
  isLocalUploadImageUrl,
  notifyProfileUpdated,
  patchProfile,
  uploadProfileAvatar,
  type User,
} from "@/lib/api";
import { THAI_PROVINCES, THAI_PROVINCE_DATALIST_ID } from "@/lib/thaiProvinces";

function dash(s: string | null | undefined) {
  const t = (s ?? "").trim();
  return t.length ? t : "—";
}

export default function ProfilePage() {
  const router = useRouter();
  const { confirm } = useAppModal();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  /** บังคับให้ <Image> โหลดใหม่หลังอัปโหลดรูป (path เดิมถูก cache) */
  const [avatarRenderNonce, setAvatarRenderNonce] = useState(0);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const [avatarOk, setAvatarOk] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");

  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);

  function hydrateDraftFromUser(u: User) {
    setName(u.name);
    setEmail(u.email);
    setPhone(u.phone ?? "");
    setAddressLine1(u.address_line1 ?? "");
    setAddressLine2(u.address_line2 ?? "");
    setCity(u.city ?? "");
    setProvince(u.province ?? "");
    setPostalCode(u.postal_code ?? "");
    setCountry(u.country ?? "");
  }

  useEffect(() => {
    const t = getToken();
    if (!t) {
      queueMicrotask(() => {
        setLoading(false);
        router.replace("/login?next=/profile");
      });
      return;
    }
    void fetchMe(t)
      .then((u) => {
        queueMicrotask(() => {
          setUser(u);
          hydrateDraftFromUser(u);
        });
      })
      .catch(() => queueMicrotask(() => router.replace("/login?next=/profile")))
      .finally(() => queueMicrotask(() => setLoading(false)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; router is stable for replace
  }, []);

  function startEditing() {
    if (!user) return;
    setErr(null);
    setOkMsg(null);
    setAvatarErr(null);
    setAvatarOk(null);
    hydrateDraftFromUser(user);
    setEditing(true);
  }

  function cancelEditing() {
    if (!user) return;
    setErr(null);
    setOkMsg(null);
    setAvatarErr(null);
    setAvatarOk(null);
    hydrateDraftFromUser(user);
    setEditing(false);
  }

  async function saveProfile() {
    const t = getToken();
    if (!t) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr("กรุณากรอกชื่อที่แสดง");
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErr("กรุณากรอกอีเมลให้ถูกต้อง");
      return;
    }
    setErr(null);
    setOkMsg(null);
    setAvatarErr(null);
    setAvatarOk(null);
    setSaving(true);
    try {
      const u = await patchProfile(t, {
        name: trimmedName,
        email: trimmedEmail,
        phone: phone.trim() || null,
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        city: city.trim() || null,
        province: province.trim() || null,
        postal_code: postalCode.trim() || null,
        country: country.trim() || null,
      });
      setUser(u);
      hydrateDraftFromUser(u);
      notifyProfileUpdated();
      setOkMsg("บันทึกข้อมูลเรียบร้อยแล้ว");
      setEditing(false);
    } catch (e) {
      let m = formatNetworkError(e);
      if (m === "Email already in use") m = "อีเมลนี้ถูกใช้แล้ว";
      setErr(m);
    } finally {
      setSaving(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await saveProfile();
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    const t = getToken();
    if (!t) return;
    setPwErr(null);
    setPwOk(null);
    if (pwNew.length < 6) {
      setPwErr("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwErr("รหัสผ่านใหม่กับยืนยันไม่ตรงกัน");
      return;
    }
    setPwBusy(true);
    try {
      const u = await changePassword(t, { current_password: pwCurrent, new_password: pwNew });
      setUser(u);
      hydrateDraftFromUser(u);
      notifyProfileUpdated();
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setPwOk("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
    } catch (e) {
      let m = formatNetworkError(e);
      if (m === "Current password is incorrect") m = "รหัสผ่านปัจจุบันไม่ถูกต้อง";
      setPwErr(m);
    } finally {
      setPwBusy(false);
    }
  }

  async function onAvatarPick(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    const t = getToken();
    if (!file || !t) return;
    setAvatarErr(null);
    setAvatarOk(null);
    setErr(null);
    setOkMsg(null);
    setAvatarBusy(true);
    try {
      const u = await uploadProfileAvatar(t, file);
      setUser(u);
      setAvatarRenderNonce((n) => n + 1);
      notifyProfileUpdated();
      setAvatarOk("อัปเดตรูปโปรไฟล์แล้ว");
    } catch (e) {
      setAvatarErr(formatNetworkError(e));
    } finally {
      setAvatarBusy(false);
      ev.target.value = "";
    }
  }

  async function removeAvatar() {
    const ok = await confirm({
      title: "ลบรูปโปรไฟล์",
      message: "ต้องการลบรูปโปรไฟล์และกลับไปใช้ตัวอักษรย่อแทนหรือไม่?",
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "danger",
    });
    if (!ok) return;
    const t = getToken();
    if (!t) return;
    setAvatarErr(null);
    setAvatarOk(null);
    setErr(null);
    setOkMsg(null);
    setAvatarBusy(true);
    try {
      const u = await deleteProfileAvatar(t);
      setUser(u);
      setAvatarRenderNonce((n) => n + 1);
      notifyProfileUpdated();
      setAvatarOk("ลบรูปโปรไฟล์แล้ว");
    } catch (e) {
      setAvatarErr(formatNetworkError(e));
    } finally {
      setAvatarBusy(false);
    }
  }

  const avatarSrc = user?.avatar_url?.startsWith("/uploads/") ? user.avatar_url : user?.avatar_url ?? null;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-xl space-y-8 px-4 py-10">
        <div className="rounded-3xl border border-stone-200/90 bg-white/70 p-6 ring-1 ring-stone-900/[0.03] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/70 md:p-8">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-50">โปรไฟล์</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            กด「แก้ไขข้อมูล」เพื่อเปลี่ยนชื่อ อีเมลล็อกอิน และที่อยู่ — บันทึกเมื่อกด「บันทึกข้อมูล」ส่วนรหัสผ่านเปลี่ยนได้ในฟอร์ม「ความปลอดภัย」ด้านล่าง
          </p>
          <p className="mt-3 text-sm">
            <Link
              href="/addresses"
              className="font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
            >
              สมุดที่อยู่
            </Link>
            <span className="text-stone-400 dark:text-stone-500"> · </span>
            <Link
              href="/settings/notifications"
              className="font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
            >
              ตั้งค่าการแจ้งเตือน
            </Link>
            <span className="text-stone-400 dark:text-stone-500"> · </span>
            <Link href="/recent" className="font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
              สินค้าที่ดูล่าสุด
            </Link>
            <span className="text-stone-400 dark:text-stone-500"> · </span>
            <Link href="/stock-alerts" className="font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
              แจ้งเตือนสต็อก
            </Link>
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-stone-500">กำลังโหลด…</p>
        ) : user ? (
          <div className="space-y-8">
            <div className="rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">รูปโปรไฟล์</h2>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                JPG / PNG / WebP / GIF / AVIF / BMP / SVG / HEIC ฯลฯ สูงสุด 5MB — เลือกไฟล์แล้วอัปโหลดทันที ไม่ต้องกด「บันทึกข้อมูล」
              </p>
              {avatarErr ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{avatarErr}</p> : null}
              {avatarOk ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{avatarOk}</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800">
                  {avatarSrc ? (
                    <Image
                      key={`${user.avatar_url ?? ""}-${avatarRenderNonce}`}
                      src={avatarSrc}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="96px"
                      unoptimized={isLocalUploadImageUrl(user.avatar_url)}
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-2xl font-bold text-stone-400">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="cursor-pointer rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 transition hover:bg-stone-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:hover:bg-zinc-800">
                    {avatarBusy ? "กำลังอัปโหลด…" : "เลือกรูป"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.svg,.ico,.heic,.heif"
                      className="sr-only"
                      disabled={avatarBusy}
                      onChange={(ev) => void onAvatarPick(ev)}
                    />
                  </label>
                  {user.avatar_url ? (
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => void removeAvatar()}
                      className="text-left text-sm text-red-600 underline disabled:opacity-50 dark:text-red-400"
                    >
                      ลบรูป
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">ข้อมูลส่วนตัว</h2>
                {!editing ? (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-100 dark:hover:bg-teal-900/40"
                  >
                    แก้ไขข้อมูล
                  </button>
                ) : null}
              </div>
              <p className="text-base font-semibold text-stone-900 dark:text-stone-100">{dash(user.name)}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">อีเมลสำหรับล็อกอิน: {user.email}</p>
              {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
              {okMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{okMsg}</p> : null}

              {!editing ? (
                <dl className="mt-4 space-y-4 text-sm">
                  <div>
                    <dt className="font-medium text-stone-500 dark:text-stone-400">อีเมล (ล็อกอิน)</dt>
                    <dd className="mt-1 text-stone-900 dark:text-stone-100">{user.email}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-stone-500 dark:text-stone-400">ชื่อที่แสดง</dt>
                    <dd className="mt-1 text-stone-900 dark:text-stone-100">{dash(user.name)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-stone-500 dark:text-stone-400">โทรศัพท์</dt>
                    <dd className="mt-1 text-stone-900 dark:text-stone-100">{dash(user.phone)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-stone-500 dark:text-stone-400">ที่อยู่บรรทัด 1</dt>
                    <dd className="mt-1 text-stone-900 dark:text-stone-100">{dash(user.address_line1)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-stone-500 dark:text-stone-400">ที่อยู่บรรทัด 2</dt>
                    <dd className="mt-1 text-stone-900 dark:text-stone-100">{dash(user.address_line2)}</dd>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-stone-500 dark:text-stone-400">เมือง / อำเภอ</dt>
                      <dd className="mt-1 text-stone-900 dark:text-stone-100">{dash(user.city)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-stone-500 dark:text-stone-400">จังหวัด</dt>
                      <dd className="mt-1 text-stone-900 dark:text-stone-100">{dash(user.province)}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="font-medium text-stone-500 dark:text-stone-400">รหัสไปรษณีย์</dt>
                    <dd className="mt-1 text-stone-900 dark:text-stone-100">{dash(user.postal_code)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-stone-500 dark:text-stone-400">ประเทศ</dt>
                    <dd className="mt-1 text-stone-900 dark:text-stone-100">{dash(user.country)}</dd>
                  </div>
                </dl>
              ) : (
                <form
                  id="profile-form"
                  onSubmit={(e) => void save(e)}
                  noValidate
                  className="mt-4 space-y-4"
                >
                  <datalist id={THAI_PROVINCE_DATALIST_ID}>
                    {THAI_PROVINCES.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">อีเมล (ล็อกอิน)</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ชื่อที่แสดง</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">โทรศัพท์</span>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="เช่น 08xxxxxxxx"
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ที่อยู่บรรทัด 1</span>
                    <input
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ที่อยู่บรรทัด 2</span>
                    <span className="mt-0.5 block text-xs font-normal text-stone-500 dark:text-stone-400">
                      เช่น แขวง/ตำบล — ไม่ต้องใส่จังหวัดซ้ำ (มีช่องจังหวัดแยกด้านล่าง)
                    </span>
                    <input
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-stone-700 dark:text-stone-300">เมือง / อำเภอ</span>
                      <span className="mt-0.5 block text-xs font-normal text-stone-500 dark:text-stone-400">
                        ระดับอำเภอเท่านั้น — ไม่ต้องพิมพ์จังหวัดในช่องนี้
                      </span>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-stone-700 dark:text-stone-300">จังหวัด</span>
                      <span className="mt-0.5 block text-xs font-normal text-stone-500 dark:text-stone-400">
                        เลือกจากรายการหรือพิมพ์ชื่อจังหวัดเองได้
                      </span>
                      <input
                        list={THAI_PROVINCE_DATALIST_ID}
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        autoComplete="address-level1"
                        className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">รหัสไปรษณีย์</span>
                    <input
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ประเทศ</span>
                    <input
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                    />
                  </label>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving || avatarBusy}
                      className="cursor-pointer rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-600/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
                    </button>
                    <button
                      type="button"
                      disabled={saving || avatarBusy}
                      onClick={cancelEditing}
                      className="rounded-xl border border-stone-300 bg-white px-6 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200 dark:hover:bg-zinc-800"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="space-y-4 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">ความปลอดภัย</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">เปลี่ยนรหัสผ่านการเข้าสู่ระบบ (ไม่กระทบการล็อกอินที่ทำอยู่ในเบราว์เซอร์นี้)</p>
              {pwErr ? <p className="text-sm text-red-600 dark:text-red-400">{pwErr}</p> : null}
              {pwOk ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{pwOk}</p> : null}
              <form onSubmit={(e) => void submitPasswordChange(e)} className="space-y-4" noValidate>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">รหัสผ่านปัจจุบัน</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">รหัสผ่านใหม่</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">ยืนยันรหัสผ่านใหม่</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-stone-100"
                  />
                </label>
                <button
                  type="submit"
                  disabled={pwBusy || saving || avatarBusy}
                  className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-100 dark:hover:bg-teal-900/40"
                >
                  {pwBusy ? "กำลังอัปเดต…" : "อัปเดตรหัสผ่าน"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        <p className="text-center text-sm">
          <Link href="/" className="font-medium text-teal-700 underline dark:text-teal-400">
            กลับหน้าแรก
          </Link>
        </p>
      </main>
    </div>
  );
}
