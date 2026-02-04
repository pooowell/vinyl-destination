import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { env } from "./env";

let db: Database.Database | null = null;

const SCHEMA = `
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
`;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = env.DATABASE_PATH;

    // Ensure parent directory exists (skip for in-memory DBs)
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Initialize schema
    db.exec(SCHEMA);
  }
  return db;
}

// For testing: allow resetting the singleton
export function _resetDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
