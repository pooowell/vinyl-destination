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
  const [actionError, setActionError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const actionErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchRecommendations();

    return () => {
      // Cleanup: abort stream on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (actionErrorTimeoutRef.current) {
        clearTimeout(actionErrorTimeoutRef.current);
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

  const updateAlbumStatus = async (
    album: Album,
    status: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          albumId: album.id,
          albumName: album.name,
          artistName: album.artist,
          imageUrl: album.imageUrl,
          status,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(errText || `HTTP ${res.status}`);
      }
      return true;
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update album",
      );
      if (actionErrorTimeoutRef.current) {
        clearTimeout(actionErrorTimeoutRef.current);
      }
      actionErrorTimeoutRef.current = setTimeout(
        () => setActionError(null),
        4000,
      );
      return false;
    }
  };

  const handleOwn = async (album: Album) => {
    if (await updateAlbumStatus(album, "owned")) {
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
    }
  };

  const handleWishlist = async (album: Album) => {
    if (await updateAlbumStatus(album, "wishlist")) {
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
    }
  };

  const handleSkip = async (album: Album) => {
    if (await updateAlbumStatus(album, "skipped")) {
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
      setIsModalOpen(false);
      setSelectedAlbum(null);
    }
  };

  const handleNotInterested = async (album: Album) => {
    if (await updateAlbumStatus(album, "not_interested")) {
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

  const handleModalOwn = async () => {
    if (selectedAlbum) {
      if (await updateAlbumStatus(selectedAlbum, "owned")) {
        setAlbums((prev) => prev.filter((a) => a.id !== selectedAlbum.id));
        setIsModalOpen(false);
        setSelectedAlbum(null);
      }
    }
  };

  const handleModalWishlist = async () => {
    if (selectedAlbum) {
      if (await updateAlbumStatus(selectedAlbum, "wishlist")) {
        setAlbums((prev) => prev.filter((a) => a.id !== selectedAlbum.id));
        setIsModalOpen(false);
        setSelectedAlbum(null);
      }
    }
  };

  const handleModalSkip = async () => {
    if (selectedAlbum) {
      if (await updateAlbumStatus(selectedAlbum, "skipped")) {
        setAlbums((prev) => prev.filter((a) => a.id !== selectedAlbum.id));
        setIsModalOpen(false);
        setSelectedAlbum(null);
      }
    }
  };

  const handleModalNotInterested = async () => {
    if (selectedAlbum) {
      if (await updateAlbumStatus(selectedAlbum, "not_interested")) {
        setAlbums((prev) => prev.filter((a) => a.id !== selectedAlbum.id));
        setIsModalOpen(false);
        setSelectedAlbum(null);
      }
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
        {actionError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between rounded-lg bg-red-900/60 px-4 py-3 text-sm text-red-200 border border-red-700"
          >
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="ml-4 text-red-300 hover:text-white"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}
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
