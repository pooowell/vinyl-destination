import Navbar from "@/components/Navbar";
import SkeletonCard from "@/components/SkeletonCard";

export default function RecommendationsLoading() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Heading skeleton */}
        <div className="mb-8">
          <div className="animate-pulse h-8 bg-zinc-800 rounded w-56 mb-2" />
          <div className="animate-pulse h-4 bg-zinc-800 rounded w-80" />
        </div>

        {/* Album grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 15 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
