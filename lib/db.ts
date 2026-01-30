import { getDatabase } from "./database";

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

export function upsertUser(user: {
  id: string;
  display_name?: string;
  email?: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO users (id, display_name, email, access_token, refresh_token, token_expires_at)
    VALUES (@id, @display_name, @email, @access_token, @refresh_token, @token_expires_at)
    ON CONFLICT(id) DO UPDATE SET
      display_name = @display_name,
      email = @email,
      access_token = @access_token,
      refresh_token = @refresh_token,
      token_expires_at = @token_expires_at
  `);
  stmt.run({
    id: user.id,
    display_name: user.display_name || null,
    email: user.email || null,
    access_token: user.access_token,
    refresh_token: user.refresh_token,
    token_expires_at: user.token_expires_at,
  });
}

export function getUser(id: string): User | undefined {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(id) as User | undefined;
}

export function updateUserTokens(
  id: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE users
    SET access_token = ?, refresh_token = ?, token_expires_at = ?
    WHERE id = ?
  `);
  stmt.run(accessToken, refreshToken, expiresAt, id);
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

export function setAlbumStatus(
  userId: string,
  album: {
    album_id: string;
    album_name: string;
    artist_name: string;
    image_url: string;
  },
  status: AlbumStatus
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO user_albums (user_id, album_id, album_name, artist_name, image_url, status, created_at)
    VALUES (@user_id, @album_id, @album_name, @artist_name, @image_url, @status, @created_at)
    ON CONFLICT(user_id, album_id) DO UPDATE SET
      album_name = @album_name,
      artist_name = @artist_name,
      image_url = @image_url,
      status = @status,
      created_at = @created_at
  `);
  stmt.run({
    user_id: userId,
    album_id: album.album_id,
    album_name: album.album_name,
    artist_name: album.artist_name,
    image_url: album.image_url,
    status,
    created_at: Math.floor(Date.now() / 1000),
  });
}

export function getUserAlbumsByStatus(
  userId: string,
  status: AlbumStatus
): UserAlbum[] {
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT * FROM user_albums WHERE user_id = ? AND status = ? ORDER BY created_at DESC"
  );
  return stmt.all(userId, status) as UserAlbum[];
}

export function getAllUserAlbumIds(userId: string): string[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT album_id FROM user_albums WHERE user_id = ?");
  const rows = stmt.all(userId) as { album_id: string }[];
  return rows.map((r) => r.album_id);
}

export function getActiveUserAlbumIds(userId: string): string[] {
  const expiryTime = Math.floor(Date.now() / 1000) - SKIP_EXPIRY_SECONDS;
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT album_id FROM user_albums
    WHERE user_id = ?
      AND (status != 'skipped' OR created_at > ?)
  `);
  const rows = stmt.all(userId, expiryTime) as { album_id: string }[];
  return rows.map((r) => r.album_id);
}

export function cleanupExpiredSkips(userId: string): void {
  const expiryTime = Math.floor(Date.now() / 1000) - SKIP_EXPIRY_SECONDS;
  const db = getDatabase();
  const stmt = db.prepare(
    "DELETE FROM user_albums WHERE user_id = ? AND status = 'skipped' AND created_at <= ?"
  );
  stmt.run(userId, expiryTime);
}

export function removeAlbumStatus(userId: string, albumId: string): void {
  const db = getDatabase();
  const stmt = db.prepare(
    "DELETE FROM user_albums WHERE user_id = ? AND album_id = ?"
  );
  stmt.run(userId, albumId);
}

// Vinyl cache operations
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface VinylCacheEntry {
  id: number;
  artist_name: string;
  album_name: string;
  has_vinyl: number;
  discogs_url: string | null;
  checked_at: number;
}

export function getCachedVinylStatus(
  artistName: string,
  albumName: string
): { hasVinyl: boolean; discogsUrl: string | null } | null {
  const expiryTime = Math.floor(Date.now() / 1000) - CACHE_TTL_SECONDS;
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT * FROM vinyl_cache WHERE artist_name = ? AND album_name = ? AND checked_at > ?"
  );
  const row = stmt.get(
    artistName.toLowerCase(),
    albumName.toLowerCase(),
    expiryTime
  ) as VinylCacheEntry | undefined;

  if (!row) return null;

  return {
    hasVinyl: row.has_vinyl === 1,
    discogsUrl: row.discogs_url,
  };
}

export function setCachedVinylStatus(
  artistName: string,
  albumName: string,
  hasVinyl: boolean,
  discogsUrl?: string
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO vinyl_cache (artist_name, album_name, has_vinyl, discogs_url, checked_at)
    VALUES (@artist_name, @album_name, @has_vinyl, @discogs_url, @checked_at)
    ON CONFLICT(artist_name, album_name) DO UPDATE SET
      has_vinyl = @has_vinyl,
      discogs_url = @discogs_url,
      checked_at = @checked_at
  `);
  stmt.run({
    artist_name: artistName.toLowerCase(),
    album_name: albumName.toLowerCase(),
    has_vinyl: hasVinyl ? 1 : 0,
    discogs_url: discogsUrl || null,
    checked_at: Math.floor(Date.now() / 1000),
  });
}

export function getBulkCachedVinylStatus(
  albums: { artist: string; album: string }[]
): Map<string, { hasVinyl: boolean; discogsUrl: string | null }> {
  const results = new Map<
    string,
    { hasVinyl: boolean; discogsUrl: string | null }
  >();

  if (albums.length === 0) return results;

  const expiryTime = Math.floor(Date.now() / 1000) - CACHE_TTL_SECONDS;
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT * FROM vinyl_cache WHERE artist_name = ? AND album_name = ? AND checked_at > ?"
  );

  for (const { artist, album } of albums) {
    const artistLower = artist.toLowerCase();
    const albumLower = album.toLowerCase();
    const row = stmt.get(artistLower, albumLower, expiryTime) as
      | VinylCacheEntry
      | undefined;

    if (row) {
      results.set(`${artistLower}|${albumLower}`, {
        hasVinyl: row.has_vinyl === 1,
        discogsUrl: row.discogs_url,
      });
    }
  }

  return results;
}
