import { getSupabase } from "./supabase";

// User operations
export interface User {
  id: string;
  display_name: string | null;
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: number | null;
  created_at: number;
}

export async function upsertUser(user: {
  id: string;
  display_name?: string;
  email?: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("users")
    .upsert({
      id: user.id,
      display_name: user.display_name || null,
      email: user.email || null,
      access_token: user.access_token,
      refresh_token: user.refresh_token,
      token_expires_at: user.token_expires_at,
    });

  if (error) {
    console.error("Error upserting user:", error);
    throw error;
  }
}

export async function getUser(id: string): Promise<User | undefined> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return undefined;
    }
    console.error("Error getting user:", error);
    throw error;
  }

  return data as User;
}

export async function updateUserTokens(
  id: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("users")
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
    })
    .eq("id", id);

  if (error) {
    console.error("Error updating user tokens:", error);
    throw error;
  }
}

// Album operations
export type AlbumStatus = "owned" | "wishlist" | "skipped" | "not_interested";

const SKIP_EXPIRY_SECONDS = 48 * 60 * 60; // 48 hours

export interface UserAlbum {
  id: number;
  user_id: string;
  album_id: string;
  album_name: string | null;
  artist_name: string | null;
  image_url: string | null;
  status: AlbumStatus;
  created_at: number;
}

export async function setAlbumStatus(
  userId: string,
  album: {
    album_id: string;
    album_name: string;
    artist_name: string;
    image_url: string;
  },
  status: AlbumStatus
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("user_albums")
    .upsert(
      {
        user_id: userId,
        album_id: album.album_id,
        album_name: album.album_name,
        artist_name: album.artist_name,
        image_url: album.image_url,
        status,
        created_at: Math.floor(Date.now() / 1000),
      },
      {
        onConflict: "user_id,album_id",
      }
    );

  if (error) {
    console.error("Error setting album status:", error);
    throw error;
  }
}

export async function getUserAlbumsByStatus(
  userId: string,
  status: AlbumStatus
): Promise<UserAlbum[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("user_albums")
    .select("*")
    .eq("user_id", userId)
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error getting user albums by status:", error);
    throw error;
  }

  return (data as UserAlbum[]) || [];
}

export async function getAllUserAlbumIds(userId: string): Promise<string[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("user_albums")
    .select("album_id")
    .eq("user_id", userId);

  if (error) {
    console.error("Error getting all user album IDs:", error);
    throw error;
  }

  return (data || []).map((r) => r.album_id);
}

export async function getActiveUserAlbumIds(userId: string): Promise<string[]> {
  const expiryTime = Math.floor(Date.now() / 1000) - SKIP_EXPIRY_SECONDS;
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from("user_albums")
    .select("album_id, status, created_at")
    .eq("user_id", userId);

  if (error) {
    console.error("Error getting active user album IDs:", error);
    throw error;
  }

  return (data || [])
    .filter((row) => row.status !== "skipped" || row.created_at > expiryTime)
    .map((r) => r.album_id);
}

export async function cleanupExpiredSkips(userId: string): Promise<void> {
  const expiryTime = Math.floor(Date.now() / 1000) - SKIP_EXPIRY_SECONDS;
  const supabase = await getSupabase();

  const { error } = await supabase
    .from("user_albums")
    .delete()
    .eq("user_id", userId)
    .eq("status", "skipped")
    .lte("created_at", expiryTime);

  if (error) {
    console.error("Error cleaning up expired skips:", error);
    throw error;
  }
}

export async function removeAlbumStatus(
  userId: string,
  albumId: string
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("user_albums")
    .delete()
    .eq("user_id", userId)
    .eq("album_id", albumId);

  if (error) {
    console.error("Error removing album status:", error);
    throw error;
  }
}

// Vinyl cache operations
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface VinylCacheEntry {
  id: number;
  artist_name: string;
  album_name: string;
  has_vinyl: boolean;
  discogs_url: string | null;
  checked_at: number;
}

export async function getCachedVinylStatus(
  artistName: string,
  albumName: string
): Promise<{ hasVinyl: boolean; discogsUrl: string | null } | null> {
  const expiryTime = Math.floor(Date.now() / 1000) - CACHE_TTL_SECONDS;
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from("vinyl_cache")
    .select("*")
    .eq("artist_name", artistName.toLowerCase())
    .eq("album_name", albumName.toLowerCase())
    .gt("checked_at", expiryTime)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("Error getting cached vinyl status:", error);
    throw error;
  }

  return {
    hasVinyl: data.has_vinyl,
    discogsUrl: data.discogs_url,
  };
}

export async function setCachedVinylStatus(
  artistName: string,
  albumName: string,
  hasVinyl: boolean,
  discogsUrl?: string
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("vinyl_cache")
    .upsert(
      {
        artist_name: artistName.toLowerCase(),
        album_name: albumName.toLowerCase(),
        has_vinyl: hasVinyl,
        discogs_url: discogsUrl || null,
        checked_at: Math.floor(Date.now() / 1000),
      },
      {
        onConflict: "artist_name,album_name",
      }
    );

  if (error) {
    console.error("Error setting cached vinyl status:", error);
    throw error;
  }
}

export async function getBulkCachedVinylStatus(
  albums: { artist: string; album: string }[]
): Promise<Map<string, { hasVinyl: boolean; discogsUrl: string | null }>> {
  const results = new Map<string, { hasVinyl: boolean; discogsUrl: string | null }>();
  const expiryTime = Math.floor(Date.now() / 1000) - CACHE_TTL_SECONDS;
  const supabase = await getSupabase();

  const queries = albums.map((a) => ({
    artist: a.artist.toLowerCase(),
    album: a.album.toLowerCase(),
  }));

  const promises = queries.map(async ({ artist, album }) => {
    const { data, error } = await supabase
      .from("vinyl_cache")
      .select("*")
      .eq("artist_name", artist)
      .eq("album_name", album)
      .gt("checked_at", expiryTime)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      console.error("Error in bulk vinyl status query:", error);
      return null;
    }

    return {
      key: `${artist}|${album}`,
      hasVinyl: data.has_vinyl,
      discogsUrl: data.discogs_url,
    };
  });

  const resultsArray = await Promise.all(promises);

  for (const result of resultsArray) {
    if (result) {
      results.set(result.key, {
        hasVinyl: result.hasVinyl,
        discogsUrl: result.discogsUrl,
      });
    }
  }

  return results;
}
