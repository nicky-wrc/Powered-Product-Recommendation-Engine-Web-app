import { notFound, redirect } from "next/navigation";

import { fetchProductByStoreCode } from "@/lib/api";

type Props = { params: Promise<{ code: string }> };

/** Resolves stable store codes (e.g. REC-…) to canonical UUID PDP URLs. */
export default async function ProductByCodePage({ params }: Props) {
  const { code } = await params;
  const data = await fetchProductByStoreCode(decodeURIComponent(code));
  if (!data) notFound();
  redirect(`/products/${data.product.id}`);
}
