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
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Auto-dismiss action errors after 5 seconds
  useEffect(() => {
    if (actionError) {
      const timer = setTimeout(() => setActionError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionError]);

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
    setRestoringId(album.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/collection?albumId=${album.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to restore album");
      }

      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to restore album"
      );
    } finally {
      setRestoringId(null);
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

        {actionError && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-600/20 border border-red-600/50 rounded-lg text-red-400 flex items-center justify-between"
          >
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="ml-4 text-red-400 hover:text-red-300"
              aria-label="Dismiss error"
            >
              ✕
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
