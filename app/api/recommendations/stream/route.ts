import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { applyRateLimit, streamLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
import {
  getTopTracks,
  getSavedAlbums,
  getRecentlyPlayed,
  SpotifyAlbum,
  getRecommendations,
} from "@/lib/spotify";
import { getActiveUserAlbumIds, getUserAlbumsByStatus, cleanupExpiredSkips } from "@/lib/db";
import { checkVinylAvailability, getMostCollectedVinyl } from "@/lib/discogs";

export type RecommendationSource =
  | "top_tracks"
  | "saved_albums"
  | "recent_plays"
  | "long_term"
  | "collection_based"
  | "classic";

export interface ListeningStats {
  topTracksCount: number;      // How many tracks from this album are in user's top 50
  highestRank: number | null;  // Rank of highest track (1-50)
  trackName: string | null;    // Name of highest ranked track
  recentlyPlayed: boolean;     // Was a track from this album recently played
  timeRange: "recent" | "all-time";  // Whether stats are from recent or all-time listening
}

export interface StreamedAlbum {
  id: string;
  name: string;
  artist: string;
  imageUrl: string;
  releaseDate: string;
  source: RecommendationSource;
  discogsUrl: string | null;
  listeningStats?: ListeningStats;  // Only included when notable
}

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, streamLimiter);
  if (blocked) return blocked;

  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, accessToken } = auth;

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendAlbum = (album: StreamedAlbum) => {
          const data = `data: ${JSON.stringify(album)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        const sendDone = () => {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        };

        try {
          // Clean up expired skipped albums so they can be shown again
          await cleanupExpiredSkips(userId);

          // Get albums user has already actioned (excluding expired skips)
          const actionedAlbumIds = new Set(await getActiveUserAlbumIds(userId));
          const seenAlbumIds = new Set<string>();

          // Helper to process and stream an album
          // Note: getNotableStats is defined after data is fetched, so we use a closure
          const processAlbum = async (
            album: SpotifyAlbum,
            source: RecommendationSource,
            statsGetter?: (albumId: string) => ListeningStats | undefined
          ): Promise<boolean> => {
            // Skip if already actioned or seen
            if (actionedAlbumIds.has(album.id) || seenAlbumIds.has(album.id)) {
              return false;
            }
            // Skip singles/EPs
            if (album.album_type !== "album") {
              return false;
            }

            const artistName = album.artists.map((a) => a.name).join(", ");
            const result = await checkVinylAvailability(artistName, album.name);

            if (result.available) {
              seenAlbumIds.add(album.id);
              const listeningStats = statsGetter?.(album.id);
              sendAlbum({
                id: album.id,
                name: album.name,
                artist: artistName,
                imageUrl: album.images[0]?.url || "",
                releaseDate: album.release_date,
                source,
                discogsUrl: result.discogsUrl,
                ...(listeningStats && { listeningStats }),
              });
              return true;
            }
            return false;
          };

          // 1. Fetch and stream from multiple sources in parallel
          const [
            topTracksResponse,
            savedAlbumsResponse,
            recentlyPlayedResponse,
            longTermTracksResponse,
          ] = await Promise.all([
            getTopTracks(accessToken, "medium_term", 50),
            getSavedAlbums(accessToken, 50),
            getRecentlyPlayed(accessToken, 50),
            getTopTracks(accessToken, "long_term", 50),
          ]);

          // Build listening stats map: albumId -> stats
          // Track recent (medium_term) and all-time (long_term) separately
          const recentStats = new Map<string, { tracks: { rank: number; name: string }[] }>();
          const allTimeStats = new Map<string, { tracks: { rank: number; name: string }[] }>();

          // Process top tracks (medium term = recent ~6 months)
          topTracksResponse.items.forEach((track, index) => {
            if (!track.album) return;
            const albumId = track.album.id;
            const existing = recentStats.get(albumId) || { tracks: [] };
            existing.tracks.push({ rank: index + 1, name: track.name });
            recentStats.set(albumId, existing);
          });

          // Process long-term top tracks (all-time)
          longTermTracksResponse.items.forEach((track, index) => {
            if (!track.album) return;
            const albumId = track.album.id;
            const existing = allTimeStats.get(albumId) || { tracks: [] };
            existing.tracks.push({ rank: index + 1, name: track.name });
            allTimeStats.set(albumId, existing);
          });

          // Mark recently played albums
          const recentAlbumIds = new Set(
            recentlyPlayedResponse.items
              .map((i) => i.track.album?.id)
              .filter((id): id is string => !!id)
          );

          // Helper to get listening stats for an album
          // Priority: recent top tracks > all-time top tracks > recently played
          const getNotableStats = (albumId: string): ListeningStats | undefined => {
            const recent = recentStats.get(albumId);
            const allTime = allTimeStats.get(albumId);
            const recentlyPlayed = recentAlbumIds.has(albumId);

            // First check recent stats - show if ANY tracks in top 50
            if (recent && recent.tracks.length > 0) {
              const sortedTracks = [...recent.tracks].sort((a, b) => a.rank - b.rank);
              return {
                topTracksCount: recent.tracks.length,
                highestRank: sortedTracks[0]?.rank || null,
                trackName: sortedTracks[0]?.name || null,
                recentlyPlayed,
                timeRange: "recent",
              };
            }

            // Fall back to all-time stats - show if ANY tracks in top 50
            if (allTime && allTime.tracks.length > 0) {
              const sortedTracks = [...allTime.tracks].sort((a, b) => a.rank - b.rank);
              return {
                topTracksCount: allTime.tracks.length,
                highestRank: sortedTracks[0]?.rank || null,
                trackName: sortedTracks[0]?.name || null,
                recentlyPlayed,
                timeRange: "all-time",
              };
            }

            // Fall back to recently played (no top track data)
            if (recentlyPlayed) {
              return {
                topTracksCount: 0,
                highestRank: null,
                trackName: null,
                recentlyPlayed: true,
                timeRange: "recent",
              };
            }

            return undefined;
          };

          // Extract albums from each source
          const topTrackAlbums = topTracksResponse.items
            .map((t) => t.album)
            .filter((a) => a);
          const savedAlbums = savedAlbumsResponse.items.map((i) => i.album);
          const recentAlbums = recentlyPlayedResponse.items
            .map((i) => i.track.album)
            .filter((a) => a);
          const longTermAlbums = longTermTracksResponse.items
            .map((t) => t.album)
            .filter((a) => a);

          // Deduplicate albums across sources, prioritizing by source
          const albumsBySource: [SpotifyAlbum[], RecommendationSource][] = [
            [topTrackAlbums, "top_tracks"],
            [savedAlbums, "saved_albums"],
            [recentAlbums, "recent_plays"],
            [longTermAlbums, "long_term"],
          ];

          // Process albums from each source
          let totalSent = 0;
          const maxAlbums = 40;

          for (const [albums, source] of albumsBySource) {
            // Shuffle albums within each source for variety
            const shuffled = [...albums].sort(() => Math.random() - 0.5);

            for (const album of shuffled) {
              if (totalSent >= maxAlbums) break;
              const sent = await processAlbum(album, source, getNotableStats);
              if (sent) totalSent++;
            }
          }

          // 2. Get collection-based recommendations
          const ownedAlbums = await getUserAlbumsByStatus(userId, "owned");
          const wishlistAlbums = await getUserAlbumsByStatus(userId, "wishlist");
          const allArtists = [
            ...ownedAlbums.map((a) => a.artist_name),
            ...wishlistAlbums.map((a) => a.artist_name),
          ].filter((name): name is string => name !== null);
          const collectionArtists = Array.from(new Set(allArtists)).slice(0, 5);

          if (collectionArtists.length > 0 && totalSent < maxAlbums) {
            try {
              // Get recommendations based on collected artists
              const seedArtists = collectionArtists.slice(0, 2);
              const recs = await getRecommendations(accessToken, [], seedArtists);

              for (const track of recs.tracks || []) {
                if (totalSent >= maxAlbums) break;
                if (track.album) {
                  const sent = await processAlbum(track.album, "collection_based", getNotableStats);
                  if (sent) totalSent++;
                }
              }
            } catch (e) {
              console.error("Error getting collection-based recommendations:", e);
            }
          }

          // 3. Sprinkle in classics from Discogs most collected
          if (totalSent < maxAlbums) {
            try {
              const classics = await getMostCollectedVinyl(undefined, 10);
              for (const classic of classics) {
                if (totalSent >= maxAlbums) break;
                // Parse title (usually "Artist - Album")
                const parts = classic.title.split(" - ");
                if (parts.length >= 2) {
                  const artist = parts[0];
                  const album = parts.slice(1).join(" - ");
                  const fakeId = `discogs_${classic.id}`;

                  if (!actionedAlbumIds.has(fakeId) && !seenAlbumIds.has(fakeId)) {
                    seenAlbumIds.add(fakeId);
                    sendAlbum({
                      id: fakeId,
                      name: album,
                      artist,
                      imageUrl: classic.cover_image || classic.thumb,
                      releaseDate: classic.year || "",
                      source: "classic",
                      discogsUrl: `https://www.discogs.com${classic.uri}`,
                    });
                    totalSent++;
                  }
                }
              }
            } catch (e) {
              console.error("Error getting classics:", e);
            }
          }

          sendDone();
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in recommendations stream:", error);
    return NextResponse.json(
      { error: "Failed to start recommendations stream" },
      { status: 500 }
    );
  }
}
