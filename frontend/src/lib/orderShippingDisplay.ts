import type { OrderPublic } from "@/lib/api";

export function hasOrderShippingSnapshot(o: OrderPublic): boolean {
  return !!(o.ship_address_line1 && String(o.ship_address_line1).trim());
}

/** Lines for admin label / copy (Thai-friendly). */
export function formatOrderShippingLines(o: OrderPublic): string[] {
  const out: string[] = [];
  if (o.ship_label?.trim()) out.push(`ป้ายที่อยู่: ${o.ship_label.trim()}`);
  if (o.ship_recipient_name?.trim()) out.push(`ชื่อผู้รับ: ${o.ship_recipient_name.trim()}`);
  if (o.ship_phone?.trim()) out.push(`โทร: ${o.ship_phone.trim()}`);
  if (o.ship_address_line1?.trim()) out.push(o.ship_address_line1.trim());
  if (o.ship_address_line2?.trim()) out.push(o.ship_address_line2.trim());
  const cityLine = [o.ship_city, o.ship_province, o.ship_postal_code].filter(Boolean).join(" ");
  if (cityLine.trim()) out.push(cityLine.trim());
  if (o.ship_country?.trim()) out.push(o.ship_country.trim());
  return out;
}
