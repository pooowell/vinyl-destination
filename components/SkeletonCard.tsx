export default function SkeletonCard() {
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
