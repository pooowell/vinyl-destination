import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { searchVinylRelease } from "@/lib/discogs";
import { getAlbumDetails, getTopTracks } from "@/lib/spotify";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: albumId } = await params;
    const { accessToken } = auth;

    // Fetch album details and user's top tracks (recent + all-time) in parallel
    // All calls go through spotifyFetch() with retry/backoff/timeout
    const [album, recentTracksResponse, allTimeTracksResponse] = await Promise.all([
      getAlbumDetails(accessToken, albumId),
      getTopTracks(accessToken, "medium_term", 50),
      getTopTracks(accessToken, "long_term", 50),
    ]);

    // Filter top tracks to those belonging to this album
    const recentTopTracks = recentTracksResponse.items
      .map((track, index) => ({
        id: track.id,
        name: track.name,
        albumId: track.album.id,
        rank: index + 1,
      }))
      .filter((track) => track.albumId === albumId);

    const allTimeTopTracks = allTimeTracksResponse.items
      .map((track, index) => ({
        id: track.id,
        name: track.name,
        albumId: track.album.id,
        rank: index + 1,
      }))
      .filter((track) => track.albumId === albumId);

    // Use recent tracks if available, otherwise all-time
    const userTopTracksFromAlbum = recentTopTracks.length > 0 ? recentTopTracks : allTimeTopTracks;
    const timeRange = recentTopTracks.length > 0 ? "recent" : "all-time";

    // Fetch Discogs vinyl info
    const artistName = album.artists.map((a) => a.name).join(", ");
    let discogsInfo = null;
    try {
      const vinylReleases = await searchVinylRelease(artistName, album.name);
      if (vinylReleases.length > 0) {
        const release = vinylReleases[0];
        discogsInfo = {
          title: release.title,
          year: release.year,
          label: release.label?.[0] || null,
          format: release.format || [],
          thumb: release.thumb,
          url: `https://www.discogs.com${release.uri}`,
          totalResults: vinylReleases.length,
        };
      }
    } catch (e) {
      logger.error("Error fetching Discogs info", { error: e instanceof Error ? e.message : String(e) });
    }

    // Format tracks with preview URLs
    const tracks = album.tracks.items.map((track) => ({
      id: track.id,
      name: track.name,
      trackNumber: track.track_number,
      durationMs: track.duration_ms,
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls.spotify,
      isTopTrack: userTopTracksFromAlbum.some((t) => t.id === track.id),
      topTrackRank: userTopTracksFromAlbum.find((t) => t.id === track.id)?.rank || null,
    }));

    return NextResponse.json({
      id: album.id,
      name: album.name,
      artist: artistName,
      artistIds: album.artists.map((a) => a.id),
      imageUrl: album.images[0]?.url || "",
      releaseDate: album.release_date,
      totalTracks: album.total_tracks,
      label: album.label,
      spotifyUrl: album.external_urls.spotify,
      tracks,
      userStats: {
        topTracksFromAlbum: userTopTracksFromAlbum.length,
        mostListenedTrack: userTopTracksFromAlbum[0] || null,
        timeRange,
      },
      discogs: discogsInfo,
    });
  } catch (error) {
    logger.error("Error fetching album details", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to fetch album details" },
      { status: 500 }
    );
  }
}
