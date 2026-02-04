import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * We can't re-import lib/env.ts multiple times (it parses at import time),
 * so we inline the same schema here and test the parsing logic directly.
 */
const envSchema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1, "SPOTIFY_CLIENT_ID is required"),
  SPOTIFY_CLIENT_SECRET: z.string().min(1, "SPOTIFY_CLIENT_SECRET is required"),
  NEXT_PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  DISCOGS_TOKEN: z.string().min(1, "DISCOGS_TOKEN is required"),
  DATABASE_PATH: z.string().default("./data/vinyl.db"),
});

const VALID_ENV = {
  SPOTIFY_CLIENT_ID: "test-id",
  SPOTIFY_CLIENT_SECRET: "test-secret",
  NEXTAUTH_SECRET: "test-nextauth-secret-32-chars!",
  DISCOGS_TOKEN: "test-discogs-token",
};

describe("env validation schema", () => {
  it("parses valid env with all required vars", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SPOTIFY_CLIENT_ID).toBe("test-id");
      expect(result.data.SPOTIFY_CLIENT_SECRET).toBe("test-secret");
      expect(result.data.NEXTAUTH_SECRET).toBe("test-nextauth-secret-32-chars!");
      expect(result.data.DISCOGS_TOKEN).toBe("test-discogs-token");
    }
  });

  it("applies default for NEXT_PUBLIC_BASE_URL when missing", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_BASE_URL).toBe("http://localhost:3000");
    }
  });

  it("applies default for DATABASE_PATH when missing", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_PATH).toBe("./data/vinyl.db");
    }
  });

  it("uses provided values over defaults", () => {
    const result = envSchema.safeParse({
      ...VALID_ENV,
      NEXT_PUBLIC_BASE_URL: "https://vinyl.example.com",
      DATABASE_PATH: "/tmp/test.db",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_BASE_URL).toBe("https://vinyl.example.com");
      expect(result.data.DATABASE_PATH).toBe("/tmp/test.db");
    }
  });

  it("fails when SPOTIFY_CLIENT_ID is missing", () => {
    const { SPOTIFY_CLIENT_ID, ...rest } = VALID_ENV;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("fails when SPOTIFY_CLIENT_SECRET is missing", () => {
    const { SPOTIFY_CLIENT_SECRET, ...rest } = VALID_ENV;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("fails when NEXTAUTH_SECRET is missing", () => {
    const { NEXTAUTH_SECRET, ...rest } = VALID_ENV;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("fails when DISCOGS_TOKEN is missing", () => {
    const { DISCOGS_TOKEN, ...rest } = VALID_ENV;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("fails when all required vars are missing and lists them all", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("SPOTIFY_CLIENT_ID");
      expect(paths).toContain("SPOTIFY_CLIENT_SECRET");
      expect(paths).toContain("NEXTAUTH_SECRET");
      expect(paths).toContain("DISCOGS_TOKEN");
    }
  });

  it("fails when required vars are empty strings", () => {
    const result = envSchema.safeParse({
      SPOTIFY_CLIENT_ID: "",
      SPOTIFY_CLIENT_SECRET: "",
      NEXTAUTH_SECRET: "",
      DISCOGS_TOKEN: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBe(4);
    }
  });
});

describe("env module (import-time parse)", () => {
  it("exports env object when setup.unit.ts stubs are present", async () => {
    // The unit test setup file stubs all required env vars,
    // so importing lib/env should succeed.
    const { env } = await import("../../lib/env");
    expect(env.SPOTIFY_CLIENT_ID).toBe("test-spotify-client-id");
    expect(env.SPOTIFY_CLIENT_SECRET).toBe("test-spotify-client-secret");
    expect(env.NEXTAUTH_SECRET).toBe("test-nextauth-secret-32-chars-long!");
    expect(env.DISCOGS_TOKEN).toBe("test-discogs-token");
    expect(env.DATABASE_PATH).toBe(":memory:");
    expect(env.NEXT_PUBLIC_BASE_URL).toBe("http://localhost:3000");
  });
});
