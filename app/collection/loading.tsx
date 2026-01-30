import Navbar from "@/components/Navbar";

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg bg-zinc-900 overflow-hidden">
      <div className="aspect-square bg-zinc-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-zinc-800 rounded w-3/4" />
        <div className="h-3 bg-zinc-800 rounded w-1/2" />
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export default function CollectionLoading() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Heading skeleton */}
        <div className="mb-8">
          <div className="animate-pulse h-8 bg-zinc-800 rounded w-48 mb-2" />
          <div className="animate-pulse h-4 bg-zinc-800 rounded w-64" />
        </div>

        <div className="space-y-12">
          {/* Owned section skeleton */}
          <section>
            <div className="animate-pulse h-6 bg-zinc-800 rounded w-32 mb-4" />
            <SkeletonGrid />
          </section>

          {/* Wishlist section skeleton */}
          <section>
            <div className="animate-pulse h-6 bg-zinc-800 rounded w-36 mb-4" />
            <SkeletonGrid />
          </section>
        </div>
      </main>
    </div>
  );
}
