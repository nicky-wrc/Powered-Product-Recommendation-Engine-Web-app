import { SiteHeader } from "@/components/SiteHeader";
import { ProductsCatalogView } from "@/components/ProductsCatalogView";
import { fetchProductCategories, fetchProducts, parseCatalogSort } from "@/lib/api";

type Props = {
  searchParams: Promise<{ q?: string; category?: string; page?: string; sort?: string }>;
};

const PAGE_SIZE = 24;

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const search = sp.q;
  const category = sp.category;
  const initialPage = parsePage(sp.page);
  const initialSort = parseCatalogSort(sp.sort);
  const [data, categories] = await Promise.all([
    fetchProducts({
      page: initialPage,
      limit: PAGE_SIZE,
      search: search,
      category: category,
      sort: initialSort,
    }),
    fetchProductCategories().catch(() => [] as string[]),
  ]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <ProductsCatalogView
          categories={categories}
          initialProducts={data.products}
          initialTotal={data.total}
          initialTotalPages={Math.max(1, data.total_pages)}
          initialPage={initialPage}
          initialQ={search?.trim() ?? ""}
          initialCategory={category}
          initialSort={initialSort}
          pageSize={PAGE_SIZE}
        />
      </main>
    </div>
  );
}
