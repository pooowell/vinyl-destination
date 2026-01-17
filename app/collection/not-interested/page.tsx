"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AlbumGrid from "@/components/AlbumGrid";
import { Album } from "@/components/AlbumCard";

export default function NotInterestedPage() {
  const router = useRouter();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNotInterested();
  }, []);

  const fetchNotInterested = async () => {
    try {
      const res = await fetch("/api/collection?status=not_interested");
      if (res.status === 401) {
        router.push("/");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to fetch albums");
      }
      const data = await res.json();
      setAlbums(
        (data.notInterested || []).map(
          (r: { id: string; name: string; artist: string; imageUrl: string }) => ({
            id: r.id,
            name: r.name,
            artist: r.artist,
            imageUrl: r.imageUrl,
          })
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (album: Album) => {
    // Remove from not_interested (this will put it back in recommendations)
    const res = await fetch(`/api/collection?albumId=${album.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link
            href="/collection"
            className="text-zinc-400 hover:text-white text-sm mb-4 inline-block"
          >
            &larr; Back to collection
          </Link>
          <h1 className="text-3xl font-bold">Not Interested</h1>
          <p className="text-zinc-400 mt-2">
            Albums you dismissed. Restore them to see them in recommendations again.
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
              onClick={fetchNotInterested}
              className="mt-4 px-4 py-2 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <AlbumGrid
            albums={albums}
            showActions={true}
            onRestore={handleRestore}
            emptyMessage="No dismissed albums."
          />
        )}
      </main>
    </div>
  );
}
