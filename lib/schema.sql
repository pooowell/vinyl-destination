CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS user_albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  album_id TEXT NOT NULL,
  album_name TEXT,
  artist_name TEXT,
  image_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('owned','wishlist','skipped','not_interested')),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, album_id)
);

CREATE TABLE IF NOT EXISTS vinyl_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_name TEXT NOT NULL,
  album_name TEXT NOT NULL,
  has_vinyl INTEGER NOT NULL DEFAULT 0,
  discogs_url TEXT,
  checked_at INTEGER NOT NULL,
  UNIQUE(artist_name, album_name)
);
