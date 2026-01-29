"use client";

import Image from "next/image";
import { useState } from "react";

export interface Album {
  id: string;
  name: string;
  artist: string;
  imageUrl: string;
}

export interface ListeningStats {
  topTracksCount: number;
  highestRank: number | null;
  trackName: string | null;
  recentlyPlayed: boolean;
  timeRange: "recent" | "all-time";
}

interface AlbumCardProps {
  album: Album;
  showActions?: boolean;
  listeningStats?: ListeningStats;
  onClick?: (album: Album) => void;
  onOwn?: (album: Album) => void;
  onWishlist?: (album: Album) => void;
  onSkip?: (album: Album) => void;
  onRemove?: (album: Album) => void;
  onRestore?: (album: Album) => void;
}

function getStatsBanner(stats: ListeningStats): { text: string; subtext: string; highlight: boolean } | null {
  const timeLabel = stats.timeRange === "recent" ? "Recent" : "All-time";

  // If has top tracks, show rank or count
  if (stats.topTracksCount > 0 && stats.highestRank !== null) {
    // Highlight if top 15 or multiple tracks
    const highlight = stats.highestRank <= 15 || stats.topTracksCount >= 2;

    // Show rank for single track, count for multiple
    if (stats.topTracksCount === 1) {
      return {
        text: `#${stats.highestRank}`,
        subtext: timeLabel,
        highlight
      };
    } else {
      return {
        text: `${stats.topTracksCount} top`,
        subtext: timeLabel,
        highlight
      };
    }
  }

  // Recently played but no top tracks
  if (stats.recentlyPlayed) {
    return {
      text: "Played",
      subtext: "Recently",
      highlight: false
    };
  }

  return null;
}

export default function AlbumCard({
  album,
  showActions = true,
  listeningStats,
  onClick,
  onOwn,
  onWishlist,
  onSkip,
  onRemove,
  onRestore,
}: AlbumCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (
    e: React.MouseEvent,
    action: (album: Album) => void
  ) => {
    e.stopPropagation();
    if (isLoading) return;
    setIsLoading(true);
    try {
      await action(album);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(album);
    }
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick(album);
    }
  };

  const banner = listeningStats ? getStatsBanner(listeningStats) : null;

  return (
    <div
      className={`group relative bg-zinc-900 rounded-lg overflow-hidden hover:bg-zinc-800 transition-colors ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      {...(onClick ? { role: "button", tabIndex: 0 } : {})}
    >
      <div className="aspect-square relative">
        {album.imageUrl ? (
          <Image
            src={album.imageUrl}
            alt={`${album.name} by ${album.artist}`}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
        ) : (
          <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-zinc-600"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
            </svg>
          </div>
        )}

        {/* Skip button - grey X in top left */}
        {onSkip && (
          <button
            onClick={(e) => handleAction(e, onSkip)}
            disabled={isLoading}
            className="absolute top-2 left-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-zinc-400 hover:bg-black/80 hover:text-white disabled:opacity-50 transition-all opacity-0 group-hover:opacity-100"
            title="Skip for now"
            aria-label="Skip this album"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Listening stats bookmark banner - top right */}
        {banner && (
          <div className="absolute -top-0.5 right-3" style={{ filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))" }}>
            <div
              className={`relative w-10 pt-2 pb-3 flex flex-col items-center rounded-t-sm ${
                banner.highlight
                  ? "bg-spotify-green text-black"
                  : "bg-zinc-700 text-white"
              }`}
              style={{
                clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 8px), 50% 100%, 0 calc(100% - 8px))",
              }}
            >
              <span className="text-xs font-bold leading-none">{banner.text}</span>
              <span className="text-[8px] opacity-70 mt-0.5 leading-none">{banner.subtext}</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-white truncate" title={album.name}>
          {album.name}
        </h3>
        <p className="text-sm text-zinc-400 truncate" title={album.artist}>
          {album.artist}
        </p>

        {showActions && (
          <div className="mt-3 flex flex-col gap-2">
            {(onOwn || onWishlist) && (
              <div className="flex gap-2">
                {onOwn && (
                  <button
                    onClick={(e) => handleAction(e, onOwn)}
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 bg-spotify-green text-black text-sm font-medium rounded hover:bg-green-400 disabled:opacity-50 transition-colors"
                  >
                    Own it
                  </button>
                )}
                {onWishlist && (
                  <button
                    onClick={(e) => handleAction(e, onWishlist)}
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-500 disabled:opacity-50 transition-colors"
                  >
                    Wishlist
                  </button>
                )}
              </div>
            )}
            {onRemove && (
              <button
                onClick={(e) => handleAction(e, onRemove)}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-red-600/20 text-red-400 text-sm font-medium rounded hover:bg-red-600/30 disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            )}
            {onRestore && (
              <button
                onClick={(e) => handleAction(e, onRestore)}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-zinc-700 text-white text-sm font-medium rounded hover:bg-zinc-600 disabled:opacity-50 transition-colors"
              >
                Restore to recommendations
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
