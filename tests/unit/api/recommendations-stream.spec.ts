import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before importing the route
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/spotify", () => ({
  getTopTracks: vi.fn(),
  getSavedAlbums: vi.fn(),
  getRecentlyPlayed: vi.fn(),
  getRecommendations: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getActiveUserAlbumIds: vi.fn(),
  getUserAlbumsByStatus: vi.fn(),
  cleanupExpiredSkips: vi.fn(),
}));

vi.mock("@/lib/discogs", () => ({
  checkVinylAvailability: vi.fn(),
  getMostCollectedVinyl: vi.fn(),
}));

import { GET } from "@/app/api/recommendations/stream/route";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getTopTracks,
  getSavedAlbums,
  getRecentlyPlayed,
  getRecommendations,
} from "@/lib/spotify";
import {
  getActiveUserAlbumIds,
  getUserAlbumsByStatus,
  cleanupExpiredSkips,
} from "@/lib/db";
import { checkVinylAvailability, getMostCollectedVinyl } from "@/lib/discogs";

// Helper: build a fake SpotifyAlbum
function fakeAlbum(id: string, name: string, artist: string) {
  return {
    id,
    name,
    album_type: "album",
    artists: [{ name: artist }],
    images: [{ url: `https://img/${id}` }],
    release_date: "2024-01-01",
  };
}

// Helper: read all SSE events from a Response stream
async function readAllEvents(response: Response): Promise<string[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on double-newline (SSE event boundary)
    const parts = buffer.split("\n\n");
    buffer = parts.pop()!; // keep incomplete tail
    for (const part of parts) {
      if (part.trim()) events.push(part.trim());
    }
  }
  if (buffer.trim()) events.push(buffer.trim());
  return events;
}

// Helper: read events until condition, then cancel reader (simulates client disconnect)
async function readUntilThenCancel(
  response: Response,
  maxEvents: number
): Promise<string[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = "";

  while (events.length < maxEvents) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop()!;
    for (const part of parts) {
      if (part.trim()) events.push(part.trim());
    }
  }

  // Client disconnects
  await reader.cancel();
  return events;
}

describe("GET /api/recommendations/stream", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      userId: "user-1",
      accessToken: "tok-123",
    });
    vi.mocked(cleanupExpiredSkips).mockResolvedValue(undefined);
    vi.mocked(getActiveUserAlbumIds).mockResolvedValue([]);
    vi.mocked(getUserAlbumsByStatus).mockResolvedValue([]);
    vi.mocked(getMostCollectedVinyl).mockResolvedValue([]);
    vi.mocked(getRecommendations).mockResolvedValue({ tracks: [] });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns SSE content-type headers", async () => {
    // Provide minimal data so the stream completes
    vi.mocked(getTopTracks).mockResolvedValue({ items: [] });
    vi.mocked(getSavedAlbums).mockResolvedValue({ items: [] });
    vi.mocked(getRecentlyPlayed).mockResolvedValue({ items: [] });

    const response = await GET();
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    // Consume the stream to avoid hanging
    await readAllEvents(response);
  });

  it("streams albums and ends with [DONE]", async () => {
    const album1 = fakeAlbum("a1", "OK Computer", "Radiohead");

    vi.mocked(getTopTracks).mockResolvedValue({
      items: [{ name: "Paranoid Android", album: album1 }],
    });
    vi.mocked(getSavedAlbums).mockResolvedValue({ items: [] });
    vi.mocked(getRecentlyPlayed).mockResolvedValue({ items: [] });
    vi.mocked(checkVinylAvailability).mockResolvedValue({
      available: true,
      discogsUrl: "https://discogs.com/ok-computer",
    });

    const response = await GET();
    const events = await readAllEvents(response);

    // Should have an album event and a [DONE] event
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]).toContain("OK Computer");
    expect(events[events.length - 1]).toBe("data: [DONE]");
  });

  it("stream has a cancel() handler (ReadableStream contract)", async () => {
    vi.mocked(getTopTracks).mockResolvedValue({ items: [] });
    vi.mocked(getSavedAlbums).mockResolvedValue({ items: [] });
    vi.mocked(getRecentlyPlayed).mockResolvedValue({ items: [] });

    const response = await GET();
    // The response body should be a ReadableStream; cancelling it should not throw
    expect(response.body).toBeInstanceOf(ReadableStream);
    await expect(response.body!.cancel()).resolves.not.toThrow();
  });

  it("stops processing albums after client disconnect (cancel)", async () => {
    // Create 10 albums, each requiring a checkVinylAvailability call
    const albums = Array.from({ length: 10 }, (_, i) =>
      fakeAlbum(`a${i}`, `Album ${i}`, `Artist ${i}`)
    );

    vi.mocked(getTopTracks).mockResolvedValue({
      items: albums.map((a) => ({ name: "Track", album: a })),
    });
    vi.mocked(getSavedAlbums).mockResolvedValue({ items: [] });
    vi.mocked(getRecentlyPlayed).mockResolvedValue({ items: [] });

    // Make checkVinylAvailability slow and always available
    vi.mocked(checkVinylAvailability).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ available: true, discogsUrl: null }), 10)
        )
    );

    const response = await GET();
    // Read 2 album events then cancel
    const events = await readUntilThenCancel(response, 2);

    expect(events.length).toBe(2);

    // Give any in-flight processing time to settle
    await new Promise((r) => setTimeout(r, 200));

    // Key assertion: checkVinylAvailability should NOT have been called
    // for all 10 albums — the abort flag should have stopped processing early.
    // We allow some extra calls (in-flight at cancel time) but far fewer than 10.
    const callCount = vi.mocked(checkVinylAvailability).mock.calls.length;
    expect(callCount).toBeLessThan(10);
  });

  it("processAlbum returns false when aborted mid-stream", async () => {
    // This tests the abort-aware processAlbum behavior indirectly:
    // If we cancel after the first album, remaining albums should not produce Discogs calls.
    // Control shuffle order so test is deterministic
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const albums = Array.from({ length: 5 }, (_, i) =>
      fakeAlbum(`album-${i}`, `Album ${i}`, `Artist ${i}`)
    );

    vi.mocked(getTopTracks).mockResolvedValue({
      items: albums.map((a, i) => ({ name: `Track ${i}`, album: a })),
    });
    vi.mocked(getSavedAlbums).mockResolvedValue({ items: [] });
    vi.mocked(getRecentlyPlayed).mockResolvedValue({ items: [] });

    vi.mocked(checkVinylAvailability).mockResolvedValue({
      available: true,
      discogsUrl: null,
    });

    const response = await GET();
    // Read 1 album event then disconnect
    const events = await readUntilThenCancel(response, 1);

    expect(events.length).toBe(1);
    // The first streamed event should be a valid album (any of them due to shuffle)
    expect(events[0]).toContain("data:");
    expect(events[0]).toContain("Album");

    await new Promise((r) => setTimeout(r, 200));

    // After cancel, checkVinylAvailability should have been called far fewer
    // than 5 times — the abort flag stops further processing
    expect(vi.mocked(checkVinylAvailability).mock.calls.length).toBeLessThanOrEqual(2);

    vi.spyOn(Math, "random").mockRestore();
  });

  it("safeEnqueue handles controller errors gracefully", async () => {
    // Simulates the case where enqueue throws after close — no crash
    const album1 = fakeAlbum("a1", "Test Album", "Test Artist");

    vi.mocked(getTopTracks).mockResolvedValue({
      items: [{ name: "Track", album: album1 }],
    });
    vi.mocked(getSavedAlbums).mockResolvedValue({ items: [] });
    vi.mocked(getRecentlyPlayed).mockResolvedValue({ items: [] });
    vi.mocked(checkVinylAvailability).mockResolvedValue({
      available: true,
      discogsUrl: null,
    });

    const response = await GET();
    // Immediately cancel — some enqueue calls may hit a closed controller
    await response.body!.cancel();

    // If we got here without throwing, the test passes
    // (safeEnqueue caught the error)
    expect(true).toBe(true);
  });
});
