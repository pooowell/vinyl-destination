import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getTopTracks,
  getSavedAlbums,
  getRecentlyPlayed,
  extractUniqueAlbums,
  SpotifyAlbum,
} from "@/lib/spotify";
import { getAllUserAlbumIds } from "@/lib/db";
import { batchCheckVinylAvailability } from "@/lib/discogs";

export interface RecommendationAlbum {
  id: string;
  name: string;
  artist: string;
  imageUrl: string;
  releaseDate: string;
}

export async function GET() {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, accessToken } = auth;

    // Fetch data from Spotify in parallel
    const [topTracksResponse, savedAlbumsResponse, recentlyPlayedResponse] =
      await Promise.all([
        getTopTracks(accessToken, "medium_term", 50),
        getSavedAlbums(accessToken, 50),
        getRecentlyPlayed(accessToken, 50),
      ]);

    // Extract unique albums
    const allAlbums = extractUniqueAlbums(
      topTracksResponse.items,
      savedAlbumsResponse.items.map((item) => item.album),
      recentlyPlayedResponse.items.map((item) => item.track)
    );

    // Get albums user has already actioned
    const actionedAlbumIds = new Set(getAllUserAlbumIds(userId));

    // Filter out actioned albums and only full albums
    const candidateAlbums = allAlbums
      .filter((album) => !actionedAlbumIds.has(album.id))
      .filter((album) => album.album_type === "album")
      .slice(0, 30); // Check up to 30 albums for vinyl availability

    // Check vinyl availability for all candidate albums
    const albumsToCheck = candidateAlbums.map((album) => ({
      albumId: album.id,
      artist: album.artists.map((a) => a.name).join(", "),
      album: album.name,
    }));

    const vinylResults = await batchCheckVinylAvailability(albumsToCheck);

    // Filter to only albums with vinyl available
    const recommendations: RecommendationAlbum[] = candidateAlbums
      .filter((album) => vinylResults.get(album.id)?.available)
      .map((album: SpotifyAlbum) => ({
        id: album.id,
        name: album.name,
        artist: album.artists.map((a) => a.name).join(", "),
        imageUrl: album.images[0]?.url || "",
        releaseDate: album.release_date,
      }));

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
