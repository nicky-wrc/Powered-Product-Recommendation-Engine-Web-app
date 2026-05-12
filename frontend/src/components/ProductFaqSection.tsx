const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "ชำระเงินและความปลอดภัยของข้อมูลเป็นอย่างไร?",
    a: "รองรับสั่งซื้อโดยตรงผ่าน API (ไม่ผ่านเกตเวย์) และการชำระผ่าน Stripe เมื่อตั้งค่า key — ข้อมูลบัตรและ PCI อยู่ที่ Stripe ไม่ถูกเก็บในแอปของร้านโดยตรง",
  },
  {
    q: "ใช้เวลาจัดส่งนานแค่ไหน?",
    a: "โดยทั่วไปจัดส่งภายใน 2–5 วันทำการตามที่แจ้งบนหน้าสินค้า — เวลาและค่าขนส่งจริงขึ้นกับนโยบายร้านและพันธมิตรโลจิสติกส์",
  },
  {
    q: "รีวิวบนหน้านี้มาจากไหน?",
    a: "รีวิวเฉพาะจากผู้ใช้ที่ล็อกอินและมีออเดอร์สถานะสำเร็จสำหรับสินค้านั้น — แอดมินสามารถลบรีวิวที่ไม่เหมาะสมได้",
  },
  {
    q: "ตะกร้าและรายการโปรดเก็บที่ไหน?",
    a: "ผู้ใช้ที่ยังไม่ล็อกอิน: ตะกร้าและหลายรายการถูกเก็บในเบราว์เซอร์ (local storage) เมื่อล็อกอินแล้วตะกร้าสอดคล้องกับเซิร์ฟเวอร์ — รายการเปรียบเทียบและเพิ่งดูล่าสุดยังอยู่บนเครื่องนี้เป็นหลัก",
  },
  {
    q: "จะติดตามคำสั่งซื้อได้อย่างไร?",
    a: "หลังสั่งซื้อ ไปที่หน้า「คำสั่งซื้อของฉัน」เพื่อดูสถานะ — หากใช้ Stripe หลังชำระสำเร็จระบบจะอัปเดตออเดอร์เมื่อ webhook/sync ทำงาน",
  },
];

export function ProductFaqSection() {
  return (
    <section className="space-y-5 rounded-3xl border border-stone-200/90 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-50">คำถามที่พบบ่อย</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          คำตอบด้านล่างเป็นข้อมูลทั่วไป — ปรับให้ตรงนโยบายและข้อกฎหมายของร้านคุณได้ที่ซอร์สโค้ดหรือ CMS
        </p>
      </div>
      <div className="divide-y divide-stone-200/90 dark:divide-zinc-800">
        {FAQ_ITEMS.map((item) => (
          <details key={item.q} className="group py-4 first:pt-0 last:pb-0">
            <summary className="cursor-pointer list-none pr-2 text-sm font-semibold text-stone-900 outline-none ring-teal-500/40 focus-visible:ring-4 dark:text-stone-100 [&::-webkit-details-marker]:hidden">
              <span className="flex items-start justify-between gap-3">
                <span>{item.q}</span>
                <span
                  className="mt-0.5 shrink-0 text-teal-600 transition group-open:rotate-180 dark:text-teal-400"
                  aria-hidden
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
