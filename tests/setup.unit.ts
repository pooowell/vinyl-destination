import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock environment variables
vi.stubEnv("DATABASE_PATH", ":memory:");
vi.stubEnv("SPOTIFY_CLIENT_ID", "test-spotify-client-id");
vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test-spotify-client-secret");
vi.stubEnv("DISCOGS_TOKEN", "test-discogs-token");
vi.stubEnv("NEXTAUTH_SECRET", "test-nextauth-secret-32-chars-long!");
vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
