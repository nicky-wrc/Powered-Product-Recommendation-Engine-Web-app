import { SiteHeader } from "@/components/SiteHeader";
import { HomeFeeds } from "@/components/HomeFeeds";
import { fetchPopular } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  const popular = await fetchPopular(8);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-12 px-4 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Personalized product discovery
          </h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            MVP storefront: auth, catalog, behavior events, and popularity-based recommendations (collaborative-style
            scoring on interactions).
          </p>
        </div>
        <HomeFeeds initialPopular={popular} />
      </main>
    </div>
  );
}
