const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";

const SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-top-read",
  "user-library-read",
  "user-read-recently-played",
].join(" ");

export function getSpotifyAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
    scope: SCOPES,
    state,
  });

  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return response.json();
}

// Spotify API calls
export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images: { url: string }[];
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  images: { url: string; height: number; width: number }[];
  release_date: string;
  album_type: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  album: SpotifyAlbum;
  artists: SpotifyArtist[];
}

async function spotifyFetch<T>(accessToken: string, endpoint: string): Promise<T> {
  const response = await fetch(`${SPOTIFY_API_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify API error: ${error}`);
  }

  return response.json();
}

export async function getCurrentUser(accessToken: string): Promise<SpotifyUser> {
  return spotifyFetch<SpotifyUser>(accessToken, "/me");
}

export async function getTopArtists(
  accessToken: string,
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term",
  limit = 20
): Promise<{ items: SpotifyArtist[] }> {
  return spotifyFetch(accessToken, `/me/top/artists?time_range=${timeRange}&limit=${limit}`);
}

export async function getTopTracks(
  accessToken: string,
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term",
  limit = 50
): Promise<{ items: SpotifyTrack[] }> {
  return spotifyFetch(accessToken, `/me/top/tracks?time_range=${timeRange}&limit=${limit}`);
}

export async function getSavedAlbums(
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<{ items: { album: SpotifyAlbum }[]; total: number }> {
  return spotifyFetch(accessToken, `/me/albums?limit=${limit}&offset=${offset}`);
}

export async function getRecentlyPlayed(
  accessToken: string,
  limit = 50
): Promise<{ items: { track: SpotifyTrack; played_at: string }[] }> {
  return spotifyFetch(accessToken, `/me/player/recently-played?limit=${limit}`);
}

export async function getArtistAlbums(
  accessToken: string,
  artistId: string,
  limit = 50
): Promise<{ items: SpotifyAlbum[] }> {
  return spotifyFetch(
    accessToken,
    `/artists/${artistId}/albums?include_groups=album&limit=${limit}`
  );
}

// Get recommendations based on seed artists or tracks
export async function getRecommendations(
  accessToken: string,
  seedTrackIds: string[] = [],
  seedArtistNames: string[] = [],
  limit = 50
): Promise<{ tracks: SpotifyTrack[] }> {
  // First, we need to convert artist names to IDs
  const artistIds: string[] = [];
  for (const name of seedArtistNames.slice(0, 3)) {
    try {
      const searchResult = await spotifyFetch<{ artists: { items: SpotifyArtist[] } }>(
        accessToken,
        `/search?q=${encodeURIComponent(name)}&type=artist&limit=1`
      );
      if (searchResult.artists.items.length > 0) {
        artistIds.push(searchResult.artists.items[0].id);
      }
    } catch {
      // Skip if search fails
    }
  }

  const seeds: string[] = [];
  if (seedTrackIds.length > 0) {
    seeds.push(`seed_tracks=${seedTrackIds.slice(0, 2).join(",")}`);
  }
  if (artistIds.length > 0) {
    seeds.push(`seed_artists=${artistIds.slice(0, 3).join(",")}`);
  }

  if (seeds.length === 0) {
    return { tracks: [] };
  }

  return spotifyFetch(
    accessToken,
    `/recommendations?${seeds.join("&")}&limit=${limit}`
  );
}

// Helper to extract unique albums from various sources
export function extractUniqueAlbums(
  topTracks: SpotifyTrack[],
  savedAlbums: SpotifyAlbum[],
  recentTracks: SpotifyTrack[]
): SpotifyAlbum[] {
  const albumMap = new Map<string, SpotifyAlbum>();

  // Add albums from top tracks
  topTracks.forEach((track) => {
    if (track.album && !albumMap.has(track.album.id)) {
      albumMap.set(track.album.id, track.album);
    }
  });

  // Add saved albums
  savedAlbums.forEach((album) => {
    if (!albumMap.has(album.id)) {
      albumMap.set(album.id, album);
    }
  });

  // Add albums from recently played
  recentTracks.forEach((track) => {
    if (track.album && !albumMap.has(track.album.id)) {
      albumMap.set(track.album.id, track.album);
    }
  });

  return Array.from(albumMap.values());
}
