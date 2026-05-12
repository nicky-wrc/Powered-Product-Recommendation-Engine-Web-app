"use client";

import { useEffect, useState } from "react";

import { API_BASE, getToken } from "@/lib/api";

export type AdminMe = { email: string; is_admin: boolean };

export function useAdminGate() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getToken();
    if (!auth) {
      queueMicrotask(() => {
        setMe(null);
        setLoading(false);
        setErr("กรุณาเข้าสู่ระบบเพื่อดูหน้านี้");
      });
      return;
    }

    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${auth}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Session invalid"))))
      .then((u: AdminMe) => {
        setMe(u);
        if (!u.is_admin) {
          setErr("เฉพาะแอดมินเท่านั้น ตั้งค่า is_admin=true ให้ user ในฐานข้อมูล");
          return;
        }
        setErr(null);
      })
      .catch(() => setErr("ยืนยันเซสชันไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  return { me, err, loading, ok: Boolean(me?.is_admin && !err) };
}
