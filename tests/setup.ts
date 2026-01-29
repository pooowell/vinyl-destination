import { expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { server } from "./mocks/server";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock environment variables
vi.stubEnv("DATABASE_PATH", ":memory:");
vi.stubEnv("SPOTIFY_CLIENT_ID", "test-spotify-client-id");
vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test-spotify-client-secret");
vi.stubEnv("DISCOGS_TOKEN", "test-discogs-token");
vi.stubEnv("NEXTAUTH_SECRET", "test-nextauth-secret-32-chars-long!");
vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");

// MSW Setup - Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

// Reset handlers and cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  server.resetHandlers();
});

// Close MSW server after all tests
afterAll(() => {
  server.close();
});
