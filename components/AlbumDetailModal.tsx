"use client";

import Image from "next/image";
import { useEffect, useState, useRef } from "react";

interface Track {
  id: string;
  name: string;
  trackNumber: number;
  durationMs: number;
  previewUrl: string | null;
  spotifyUrl: string;
  isTopTrack: boolean;
  topTrackRank: number | null;
}

interface AlbumDetails {
  id: string;
  name: string;
  artist: string;
  imageUrl: string;
  releaseDate: string;
  totalTracks: number;
  label: string;
  spotifyUrl: string;
  tracks: Track[];
  userStats: {
    topTracksFromAlbum: number;
    mostListenedTrack: { id: string; name: string; rank: number } | null;
    timeRange: "recent" | "all-time";
  };
  discogs: {
    title: string;
    year: string;
    label: string | null;
    format: string[];
    thumb: string;
    url: string;
    totalResults: number;
  } | null;
}

interface AlbumDetailModalProps {
  albumId: string;
  albumName: string;
  artistName: string;
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onOwn: () => void;
  onWishlist: () => void;
  onSkip: () => void;
  onNotInterested: () => void;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function AlbumDetailModal({
  albumId,
  albumName,
  artistName,
  imageUrl,
  isOpen,
  onClose,
  onOwn,
  onWishlist,
  onSkip,
  onNotInterested,
}: AlbumDetailModalProps) {
  const [details, setDetails] = useState<AlbumDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && albumId) {
      fetchDetails();
    }
    return () => {
      // Stop audio when modal closes
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingTrackId(null);
    };
  }, [isOpen, albumId]);

  // Auto-focus the dialog when opened
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  const fetchDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/album/${albumId}`);
      if (!res.ok) throw new Error("Failed to fetch album details");
      const data = await res.json();
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const playPreview = (track: Track) => {
    if (!track.previewUrl) return;

    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // If clicking same track, just stop
    if (playingTrackId === track.id) {
      setPlayingTrackId(null);
      return;
    }

    // Play new track
    const audio = new Audio(track.previewUrl);
    audio.volume = 0.5;
    audio.play();
    audio.onended = () => setPlayingTrackId(null);
    audioRef.current = audio;
    setPlayingTrackId(track.id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-album-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="relative bg-zinc-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header with close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          {/* Album header */}
          <div className="flex gap-6 p-6 bg-gradient-to-b from-zinc-800 to-zinc-900">
            <div className="w-40 h-40 flex-shrink-0 relative rounded-lg overflow-hidden shadow-xl">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={albumName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                  <svg className="w-16 h-16 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                  </svg>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 id="modal-album-title" className="text-2xl font-bold truncate">{albumName}</h2>
              <p className="text-zinc-400 mt-1">{artistName}</p>

              {details && (
                <div className="mt-3 text-sm text-zinc-500 space-y-1">
                  <p>{details.releaseDate?.split("-")[0]} • {details.totalTracks} tracks</p>
                  {details.label && <p>Label: {details.label}</p>}
                </div>
              )}

              {/* User stats */}
              {details?.userStats.mostListenedTrack && (
                <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">
                    Your Top Track
                    <span className="ml-2 text-zinc-600">
                      ({details.userStats.timeRange === "recent" ? "Recent" : "All-time"})
                    </span>
                  </p>
                  <p className="text-sm text-spotify-green font-medium mt-1">
                    #{details.userStats.mostListenedTrack.rank} {details.userStats.mostListenedTrack.name}
                  </p>
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-spotify-green"></div>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : details ? (
            <>
              {/* Discogs info */}
              {details.discogs && (
                <div className="px-6 py-4 border-t border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                    Vinyl Info
                  </h3>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 text-sm space-y-1">
                      {details.discogs.format.length > 0 && (
                        <p className="text-zinc-300">
                          Format: {details.discogs.format.join(", ")}
                        </p>
                      )}
                      {details.discogs.label && (
                        <p className="text-zinc-400">Label: {details.discogs.label}</p>
                      )}
                      {details.discogs.totalResults > 1 && (
                        <p className="text-zinc-500">
                          {details.discogs.totalResults} vinyl releases found
                        </p>
                      )}
                    </div>
                    <a
                      href={details.discogs.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                    >
                      View on Discogs
                    </a>
                  </div>
                </div>
              )}

              {/* Track list */}
              <div className="px-6 py-4 border-t border-zinc-800">
                {(() => {
                  const hasAnyPreviews = details.tracks.some(t => t.previewUrl);

                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                          Tracks
                        </h3>
                        {!hasAnyPreviews && (
                          <span className="text-xs text-zinc-500">
                            Previews unavailable
                          </span>
                        )}
                      </div>

                      {/* No previews callout - show prominently when no previews */}
                      {!hasAnyPreviews && (
                        <a
                          href={details.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 mb-4 bg-spotify-green/10 border border-spotify-green/20 rounded-lg hover:bg-spotify-green/20 transition-colors"
                        >
                          <svg className="w-8 h-8 text-spotify-green flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-white">Listen on Spotify</p>
                            <p className="text-xs text-zinc-400">
                              Track previews aren&apos;t available for this album
                            </p>
                          </div>
                          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}

                      <div className="space-y-1">
                        {details.tracks.map((track) => (
                          <div
                            key={track.id}
                            className={`flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 transition-colors ${
                              track.isTopTrack ? "bg-spotify-green/10" : ""
                            }`}
                          >
                            {/* Play button - only show if there are any previews */}
                            {hasAnyPreviews && (
                              <button
                                onClick={() => playPreview(track)}
                                disabled={!track.previewUrl}
                                aria-label={playingTrackId === track.id ? `Pause preview of ${track.name}` : `Play preview of ${track.name}`}
                                className={`w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 transition-colors ${
                                  track.previewUrl
                                    ? "bg-zinc-800 hover:bg-zinc-700"
                                    : "bg-zinc-800/50 cursor-not-allowed opacity-40"
                                }`}
                              >
                                {playingTrackId === track.id ? (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                )}
                              </button>
                            )}

                            {/* Track info */}
                            <span className="text-zinc-500 w-6 text-sm text-right">
                              {track.trackNumber}
                            </span>
                            <span className="flex-1 truncate text-sm">
                              {track.name}
                              {track.isTopTrack && (
                                <span className="ml-2 text-xs text-spotify-green">
                                  #{track.topTrackRank} in your top
                                </span>
                              )}
                            </span>
                            <span className="text-zinc-500 text-sm">
                              {formatDuration(track.durationMs)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Spotify link - only show if there are previews (otherwise shown above) */}
              {details.tracks.some(t => t.previewUrl) && (
                <div className="px-6 py-4 border-t border-zinc-800">
                  <a
                    href={details.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-spotify-green text-black font-medium rounded-full hover:bg-green-400 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                    Listen on Spotify
                  </a>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Action buttons - fixed at bottom */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900">
          <div className="flex gap-3">
            <button
              onClick={onOwn}
              className="flex-1 py-3 bg-spotify-green text-black font-semibold rounded-lg hover:bg-green-400 transition-colors"
            >
              Own it
            </button>
            <button
              onClick={onWishlist}
              className="flex-1 py-3 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-500 transition-colors"
            >
              Wishlist
            </button>
            <button
              onClick={onSkip}
              aria-label="Skip album"
              className="flex-1 py-3 bg-zinc-800 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Skip
            </button>
          </div>
          <button
            onClick={onNotInterested}
            className="w-full mt-3 py-2 text-zinc-500 text-sm hover:text-zinc-400 transition-colors"
          >
            Never show this album again
          </button>
        </div>
      </div>
    </div>
  );
}
