"use client";

import { useEffect, useState, useCallback } from "react";
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
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCollection();
  }, []);

  // Auto-dismiss remove errors after 5 seconds
  useEffect(() => {
    if (!removeError) return;
    const timer = setTimeout(() => setRemoveError(null), 5000);
    return () => clearTimeout(timer);
  }, [removeError]);

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

  const handleRemove = useCallback(
    async (
      album: Album,
      setList: React.Dispatch<React.SetStateAction<Album[]>>
    ) => {
      setRemoveError(null);
      setRemovingId(album.id);
      try {
        const res = await fetch(`/api/collection?albumId=${album.id}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          throw new Error(
            `Failed to remove "${album.name}" from your collection. Please try again.`
          );
        }

        setList((prev) => prev.filter((a) => a.id !== album.id));
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Failed to remove")) {
          setRemoveError(err.message);
        } else {
          setRemoveError(
            `Could not remove "${album.name}". Check your connection and try again.`
          );
        }
      } finally {
        setRemovingId(null);
      }
    },
    []
  );

  const handleRemoveOwned = useCallback(
    (album: Album) => handleRemove(album, setOwnedAlbums),
    [handleRemove]
  );

  const handleRemoveWishlist = useCallback(
    (album: Album) => handleRemove(album, setWishlistAlbums),
    [handleRemove]
  );

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

        {/* Remove error banner */}
        {removeError && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-3 rounded-lg bg-red-600/20 border border-red-600/40 px-4 py-3 text-red-400"
          >
            <p className="text-sm">{removeError}</p>
            <button
              onClick={() => setRemoveError(null)}
              className="shrink-0 text-red-400 hover:text-red-300 transition-colors"
              aria-label="Dismiss error"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

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
                <div className={removingId && ownedAlbums.some(a => a.id === removingId) ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}>
                  <AlbumGrid
                    albums={ownedAlbums}
                    showActions={true}
                    onRemove={handleRemoveOwned}
                    emptyMessage=""
                  />
                </div>
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
                <div className={removingId && wishlistAlbums.some(a => a.id === removingId) ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}>
                  <AlbumGrid
                    albums={wishlistAlbums}
                    showActions={true}
                    onRemove={handleRemoveWishlist}
                    emptyMessage=""
                  />
                </div>
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
