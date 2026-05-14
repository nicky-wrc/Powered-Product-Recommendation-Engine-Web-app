import { fetchMe, fetchUserAddresses } from "@/lib/api";

/** True if user has a non-empty shipping line on profile or at least one saved address. */
export async function userHasShippingAddress(token: string): Promise<boolean> {
  let addrs: Awaited<ReturnType<typeof fetchUserAddresses>> = [];
  try {
    addrs = await fetchUserAddresses(token);
  } catch {
    addrs = [];
  }
  if (addrs.some((a) => (a.address_line1 || "").trim().length > 0)) return true;
  try {
    const me = await fetchMe(token);
    if ((me.address_line1 || "").trim().length > 0) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Only same-origin style paths (relative), for ?next= query safety. */
export function safeInternalNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("://") || raw.includes("\\")) return null;
  return raw;
}
