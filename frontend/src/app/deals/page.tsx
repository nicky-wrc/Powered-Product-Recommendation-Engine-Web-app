import { DealsHubView } from "@/components/DealsHubView";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchProducts, parseCatalogSort } from "@/lib/api";

type Props = {
  searchParams: Promise<{
    page?: string;
    sort?: string;
  }>;
};

const PAGE_SIZE = 24;

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export default async function DealsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const initialPage = parsePage(sp.page);
  const initialSort = parseCatalogSort(sp.sort);
  const data = await fetchProducts({
    page: initialPage,
    limit: PAGE_SIZE,
    onSale: true,
    sort: initialSort,
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <DealsHubView
          initialProducts={data.products}
          initialTotal={data.total}
          initialTotalPages={Math.max(1, data.total_pages)}
          initialPage={initialPage}
          initialSort={initialSort}
          pageSize={PAGE_SIZE}
        />
      </main>
    </div>
  );
}
