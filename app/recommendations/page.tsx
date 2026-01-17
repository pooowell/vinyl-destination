"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AlbumGrid from "@/components/AlbumGrid";
import AlbumDetailModal from "@/components/AlbumDetailModal";
import { Album } from "@/components/AlbumCard";

interface ListeningStats {
  topTracksCount: number;
  highestRank: number | null;
  trackName: string | null;
  recentlyPlayed: boolean;
  timeRange: "recent" | "all-time";
}

interface StreamedAlbum extends Album {
  source: string;
  discogsUrl: string | null;
  listeningStats?: ListeningStats;
}

export default function RecommendationsPage() {
  const router = useRouter();
  const [albums, setAlbums] = useState<StreamedAlbum[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<StreamedAlbum | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchRecommendations();

    return () => {
      // Cleanup: abort stream on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchRecommendations = async () => {
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsLoading(true);
    setIsStreaming(true);
    setError(null);
    setAlbums([]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/recommendations/stream", {
        signal: abortControllerRef.current.signal,
      });

      if (response.status === 401) {
        router.push("/");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch recommendations");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      setIsLoading(false);

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          setIsStreaming(false);
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            if (data === "[DONE]") {
              setIsStreaming(false);
              break;
            }

            try {
              const parsed = JSON.parse(data);
              // Check if it's an error response
              if (parsed.error) {
                console.error("Stream error:", parsed.error);
              } else if (parsed.id) {
                setAlbums((prev) => [...prev, parsed as StreamedAlbum]);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return; // Ignore abort errors
      }
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleOwn = async (album: Album) => {
    const res = await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId: album.id,
        albumName: album.name,
        artistName: album.artist,
        imageUrl: album.imageUrl,
        status: "owned",
      }),
    });

    if (res.ok) {
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
    }
  };

  const handleWishlist = async (album: Album) => {
    const res = await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId: album.id,
        albumName: album.name,
        artistName: album.artist,
        imageUrl: album.imageUrl,
        status: "wishlist",
      }),
    });

    if (res.ok) {
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
    }
  };

  const handleSkip = async (album: Album) => {
    const res = await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId: album.id,
        albumName: album.name,
        artistName: album.artist,
        imageUrl: album.imageUrl,
        status: "skipped",
      }),
    });

    if (res.ok) {
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
      setIsModalOpen(false);
      setSelectedAlbum(null);
    }
  };

  const handleNotInterested = async (album: Album) => {
    const res = await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        albumId: album.id,
        albumName: album.name,
        artistName: album.artist,
        imageUrl: album.imageUrl,
        status: "not_interested",
      }),
    });

    if (res.ok) {
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
      setIsModalOpen(false);
      setSelectedAlbum(null);
    }
  };

  const handleAlbumClick = (album: Album) => {
    const streamedAlbum = albums.find((a) => a.id === album.id);
    if (streamedAlbum) {
      setSelectedAlbum(streamedAlbum);
      setIsModalOpen(true);
    }
  };

  const handleModalOwn = () => {
    if (selectedAlbum) {
      handleOwn(selectedAlbum);
      setIsModalOpen(false);
      setSelectedAlbum(null);
    }
  };

  const handleModalWishlist = () => {
    if (selectedAlbum) {
      handleWishlist(selectedAlbum);
      setIsModalOpen(false);
      setSelectedAlbum(null);
    }
  };

  const handleModalSkip = () => {
    if (selectedAlbum) {
      handleSkip(selectedAlbum);
    }
  };

  const handleModalNotInterested = () => {
    if (selectedAlbum) {
      handleNotInterested(selectedAlbum);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedAlbum(null);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Recommendations</h1>
          <p className="text-zinc-400 mt-2">
            Albums from your Spotify library available on vinyl.
            {isStreaming && albums.length > 0 && (
              <span className="ml-2 text-spotify-green">
                Finding more...
              </span>
            )}
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-spotify-green"></div>
            <p className="text-zinc-400 mt-4">Loading recommendations...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-500">{error}</p>
            <button
              onClick={fetchRecommendations}
              className="mt-4 px-4 py-2 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <AlbumGrid
              albums={albums}
              onClick={handleAlbumClick}
              onOwn={handleOwn}
              onWishlist={handleWishlist}
              onSkip={handleSkip}
              emptyMessage={
                isStreaming
                  ? "Searching for vinyl..."
                  : "No recommendations found. Check back later!"
              }
            />

            {isStreaming && albums.length > 0 && (
              <div className="flex justify-center mt-8">
                <div className="flex items-center gap-2 text-zinc-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-spotify-green"></div>
                  <span>Checking more albums...</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {selectedAlbum && (
        <AlbumDetailModal
          albumId={selectedAlbum.id}
          albumName={selectedAlbum.name}
          artistName={selectedAlbum.artist}
          imageUrl={selectedAlbum.imageUrl}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onOwn={handleModalOwn}
          onWishlist={handleModalWishlist}
          onSkip={handleModalSkip}
          onNotInterested={handleModalNotInterested}
        />
      )}
    </div>
  );
}
