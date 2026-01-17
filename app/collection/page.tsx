"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AlbumGrid from "@/components/AlbumGrid";
import { Album } from "@/components/AlbumCard";

export default function CollectionPage() {
  const router = useRouter();
  const [ownedAlbums, setOwnedAlbums] = useState<Album[]>([]);
  const [wishlistAlbums, setWishlistAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCollection();
  }, []);

  const fetchCollection = async () => {
    try {
      const res = await fetch("/api/collection");
      if (res.status === 401) {
        router.push("/");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to fetch collection");
      }
      const data = await res.json();

      const formatAlbum = (r: { id: string; name: string; artist: string; imageUrl: string }) => ({
        id: r.id,
        name: r.name,
        artist: r.artist,
        imageUrl: r.imageUrl,
      });

      setOwnedAlbums((data.owned || []).map(formatAlbum));
      setWishlistAlbums((data.wishlist || []).map(formatAlbum));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveOwned = async (album: Album) => {
    const res = await fetch(`/api/collection?albumId=${album.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setOwnedAlbums((prev) => prev.filter((a) => a.id !== album.id));
    }
  };

  const handleRemoveWishlist = async (album: Album) => {
    const res = await fetch(`/api/collection?albumId=${album.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setWishlistAlbums((prev) => prev.filter((a) => a.id !== album.id));
    }
  };

  const totalAlbums = ownedAlbums.length + wishlistAlbums.length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">My Collection</h1>
          <p className="text-zinc-400 mt-2">
            {ownedAlbums.length} owned, {wishlistAlbums.length} on wishlist
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-500">{error}</p>
            <button
              onClick={fetchCollection}
              className="mt-4 px-4 py-2 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : totalAlbums === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-lg">
              Your collection is empty. Add albums from the recommendations page!
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Owned Section */}
            <section>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 bg-spotify-green rounded-full"></span>
                Owned ({ownedAlbums.length})
              </h2>
              {ownedAlbums.length > 0 ? (
                <AlbumGrid
                  albums={ownedAlbums}
                  showActions={true}
                  onRemove={handleRemoveOwned}
                  emptyMessage=""
                />
              ) : (
                <p className="text-zinc-500 text-sm">No owned albums yet.</p>
              )}
            </section>

            {/* Wishlist Section */}
            <section>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                Wishlist ({wishlistAlbums.length})
              </h2>
              {wishlistAlbums.length > 0 ? (
                <AlbumGrid
                  albums={wishlistAlbums}
                  showActions={true}
                  onRemove={handleRemoveWishlist}
                  emptyMessage=""
                />
              ) : (
                <p className="text-zinc-500 text-sm">No albums on your wishlist yet.</p>
              )}
            </section>
          </div>
        )}

        {/* Not interested link */}
        <div className="mt-16 pt-8 border-t border-zinc-800 text-center">
          <Link
            href="/collection/not-interested"
            className="text-zinc-500 text-sm hover:text-zinc-400 transition-colors"
          >
            View albums marked as not interested
          </Link>
        </div>
      </main>
    </div>
  );
}
