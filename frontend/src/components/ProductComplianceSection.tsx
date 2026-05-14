import type { Product } from "@/lib/api";

type Props = { product: Product };

/** PDP block for hazmat / age / shipping restriction notes set by admin. */
export function ProductComplianceSection({ product: p }: Props) {
  const hazardous = Boolean(p.is_hazardous);
  const age = p.minimum_age != null && p.minimum_age > 0 ? p.minimum_age : null;
  const note = p.compliance_note?.trim() ?? "";
  if (!hazardous && age == null && !note) return null;

  return (
    <section
      id="product-compliance"
      className="space-y-3 rounded-3xl border border-amber-200/90 bg-amber-50/80 p-6 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/35"
      aria-labelledby="product-compliance-heading"
    >
      <h2 id="product-compliance-heading" className="text-lg font-bold text-amber-950 dark:text-amber-100">
        ข้อมูลข้อจำกัดและความปลอดภัย
      </h2>
      {(hazardous || age != null) ? (
        <ul className="list-inside list-disc space-y-2 text-sm text-amber-950/95 dark:text-amber-100/95">
          {hazardous ? (
            <li>
              <strong className="font-semibold">สินค้าอันตรายหรือจัดเก็บพิเศษ:</strong> อาจมีข้อจำกัดการขนส่ง การรับประกัน
              หรือข้อกำหนดจากผู้ให้บริการขนส่ง
            </li>
          ) : null}
          {age != null ? (
            <li>
              <strong className="font-semibold">จำกัดอายุผู้ซื้อ:</strong> {age} ปีขึ้นไป (ยืนยันอายุขณะสั่งซื้อเป็นความรับผิดชอบของผู้ซื้อ)
            </li>
          ) : null}
        </ul>
      ) : null}
      {note ? (
        <p className="text-sm text-amber-950/95 dark:text-amber-100/95">
          <strong className="font-semibold">หมายเหตุจากร้าน: </strong>
          <span className="whitespace-pre-wrap">{note}</span>
        </p>
      ) : null}
      <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
        ข้อความนี้เป็นการแจ้งเตือนทั่วไปจากร้านค้า ไม่ใช่คำรับรองทางกฎหมายหรือใบอนุญาตขนส่งสินค้าอันตราย
      </p>
    </section>
  );
}

export function productNeedsComplianceNotice(p: Pick<Product, "is_hazardous" | "minimum_age" | "compliance_note">): boolean {
  const note = p.compliance_note?.trim() ?? "";
  return Boolean(p.is_hazardous || (p.minimum_age != null && p.minimum_age > 0) || note.length > 0);
}
