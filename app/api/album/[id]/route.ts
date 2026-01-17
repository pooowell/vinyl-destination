import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { searchVinylRelease } from "@/lib/discogs";

export const dynamic = "force-dynamic";

const SPOTIFY_API_URL = "https://api.spotify.com/v1";

interface SpotifyTrack {
  id: string;
  name: string;
  track_number: number;
  duration_ms: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
}

interface SpotifyAlbumDetails {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string; height: number; width: number }[];
  release_date: string;
  total_tracks: number;
  label: string;
  external_urls: {
    spotify: string;
  };
  tracks: {
    items: SpotifyTrack[];
  };
}

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

    // Fetch album details from Spotify
    const albumResponse = await fetch(`${SPOTIFY_API_URL}/albums/${albumId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!albumResponse.ok) {
      throw new Error("Failed to fetch album from Spotify");
    }

    const album: SpotifyAlbumDetails = await albumResponse.json();

    // Fetch user's top tracks (both recent and all-time) to see which tracks from this album they listen to most
    const [recentTracksResponse, allTimeTracksResponse] = await Promise.all([
      fetch(`${SPOTIFY_API_URL}/me/top/tracks?limit=50&time_range=medium_term`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch(`${SPOTIFY_API_URL}/me/top/tracks?limit=50&time_range=long_term`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    let recentTopTracks: { id: string; name: string; rank: number }[] = [];
    let allTimeTopTracks: { id: string; name: string; rank: number }[] = [];

    if (recentTracksResponse.ok) {
      const topTracks = await recentTracksResponse.json();
      recentTopTracks = topTracks.items
        .map((track: { id: string; name: string; album: { id: string } }, index: number) => ({
          id: track.id,
          name: track.name,
          albumId: track.album.id,
          rank: index + 1,
        }))
        .filter((track: { albumId: string }) => track.albumId === albumId);
    }

    if (allTimeTracksResponse.ok) {
      const topTracks = await allTimeTracksResponse.json();
      allTimeTopTracks = topTracks.items
        .map((track: { id: string; name: string; album: { id: string } }, index: number) => ({
          id: track.id,
          name: track.name,
          albumId: track.album.id,
          rank: index + 1,
        }))
        .filter((track: { albumId: string }) => track.albumId === albumId);
    }

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
      console.error("Error fetching Discogs info:", e);
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
    console.error("Error fetching album details:", error);
    return NextResponse.json(
      { error: "Failed to fetch album details" },
      { status: 500 }
    );
  }
}
