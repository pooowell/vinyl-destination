import {
  getCachedVinylStatus,
  setCachedVinylStatus,
  getBulkCachedVinylStatus,
} from "./db";
import { logger } from "./logger";

const DISCOGS_API_URL = "https://api.discogs.com";

// In-memory cache for API responses (short-term, per-request deduplication)
const memCache = new Map<string, { data: unknown; timestamp: number }>();
const MEM_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

// --- Retry configuration ---

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
}

/** Default retry settings. Mutable so tests can override. */
export const retryDefaults: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
};

/**
 * Wraps fetch with automatic retry for 429 (rate-limit) and 5xx responses.
 * Uses exponential backoff: delay = baseDelayMs × 2^attempt.
 * For 429 responses the Retry-After header is honoured when present.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options?: Partial<RetryOptions>,
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? retryDefaults.maxRetries;
  const baseDelayMs = options?.baseDelayMs ?? retryDefaults.baseDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);

    const isRetryable =
      response.status === 429 ||
      (response.status >= 500 && response.status < 600);

    if (isRetryable && attempt < maxRetries) {
      let delayMs = baseDelayMs * Math.pow(2, attempt);

      // Respect Retry-After header for 429 responses
      if (response.status === 429) {
        const retryAfter = response.headers?.get("Retry-After");
        if (retryAfter) {
          const retryAfterMs = parseInt(retryAfter, 10) * 1000;
          if (!isNaN(retryAfterMs)) {
            delayMs = Math.max(delayMs, retryAfterMs);
          }
        }
      }

      logger.warn(
        `Discogs API returned ${response.status}, retrying in ${delayMs}ms`,
        { attempt: attempt + 1, maxRetries, delayMs },
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    return response;
  }

  // The loop always returns; this line satisfies TypeScript.
  throw new Error("fetchWithRetry: exhausted all retry attempts");
}

// --- Discogs types ---

export interface DiscogsSearchResult {
  id: number;
  title: string;
  year?: string;
  format?: string[];
  label?: string[];
  type: string;
  thumb: string;
  cover_image: string;
  uri: string;
  resource_url: string;
}

export interface DiscogsSearchResponse {
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
  results: DiscogsSearchResult[];
}

async function discogsFetch<T>(endpoint: string): Promise<T> {
  // Check memory cache first (for deduplication within same request)
  const cacheKey = endpoint;
  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MEM_CACHE_TTL) {
    return cached.data as T;
  }

  const response = await fetchWithRetry(`${DISCOGS_API_URL}${endpoint}`, {
    headers: {
      Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
      "User-Agent": "SpotifyVinylSearch/1.0",
    },
  });

  if (response.status === 429) {
    throw new Error("Discogs rate limit exceeded. Please try again later.");
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discogs API error: ${error}`);
  }

  const data = await response.json();

  // Cache the result in memory
  memCache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
}

export async function searchVinylRelease(
  artist: string,
  album: string
): Promise<DiscogsSearchResult[]> {
  const query = encodeURIComponent(`${artist} ${album}`);
  const response = await discogsFetch<DiscogsSearchResponse>(
    `/database/search?q=${query}&format=Vinyl&type=release&per_page=5`
  );
  return response.results;
}

export async function checkVinylAvailability(
  artist: string,
  album: string
): Promise<{
  available: boolean;
  discogsUrl: string | null;
}> {
  // Check database cache first
  const cached = await getCachedVinylStatus(artist, album);
  if (cached !== null) {
    return {
      available: cached.hasVinyl,
      discogsUrl: cached.discogsUrl,
    };
  }

  try {
    const releases = await searchVinylRelease(artist, album);
    const available = releases.length > 0;
    const discogsUrl = available ? `https://www.discogs.com${releases[0].uri}` : null;

    // Cache the result in database
    await setCachedVinylStatus(artist, album, available, discogsUrl || undefined);

    return { available, discogsUrl };
  } catch (error) {
    logger.error("Error checking vinyl availability", { error: error instanceof Error ? error.message : String(error) });
    return { available: false, discogsUrl: null };
  }
}

// Check multiple albums with database caching
export async function batchCheckVinylAvailability(
  albums: { artist: string; album: string; albumId: string }[]
): Promise<Map<string, { available: boolean; discogsUrl: string | null }>> {
  const results = new Map<string, { available: boolean; discogsUrl: string | null }>();

  // First, check database cache for all albums
  const dbCache = await getBulkCachedVinylStatus(
    albums.map((a) => ({ artist: a.artist, album: a.album }))
  );

  const uncachedAlbums: typeof albums = [];

  for (const albumInfo of albums) {
    const cacheKey = `${albumInfo.artist.toLowerCase()}|${albumInfo.album.toLowerCase()}`;
    const cached = dbCache.get(cacheKey);
    if (cached) {
      results.set(albumInfo.albumId, {
        available: cached.hasVinyl,
        discogsUrl: cached.discogsUrl,
      });
    } else {
      uncachedAlbums.push(albumInfo);
    }
  }

  // Fetch uncached albums from Discogs (with rate limiting)
  const batchSize = 5;
  for (let i = 0; i < uncachedAlbums.length; i += batchSize) {
    const batch = uncachedAlbums.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async ({ artist, album, albumId }) => {
        const result = await checkVinylAvailability(artist, album);
        return { albumId, result };
      })
    );

    batchResults.forEach(({ albumId, result }) => {
      results.set(albumId, result);
    });

    // Add delay between batches (Discogs allows 60 requests per minute)
    if (i + batchSize < uncachedAlbums.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

// Fetch most collected vinyl from Discogs (for "classics" recommendations)
export async function getMostCollectedVinyl(
  genre?: string,
  limit = 20
): Promise<DiscogsSearchResult[]> {
  try {
    // Search for highly collected vinyl releases
    // Sort by "have" (most collected) - this approximates popularity
    let endpoint = `/database/search?format=Vinyl&type=release&per_page=${limit}&sort=have&sort_order=desc`;
    if (genre) {
      endpoint += `&genre=${encodeURIComponent(genre)}`;
    }

    const response = await discogsFetch<DiscogsSearchResponse>(endpoint);
    return response.results;
  } catch (error) {
    logger.error("Error fetching most collected vinyl", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}
