import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function makeRequest(
  method: string,
  url: string = "http://localhost:3000/api/collection",
  origin?: string | null
): NextRequest {
  const headers = new Headers();
  if (origin !== null && origin !== undefined) {
    headers.set("origin", origin);
  }
  return new NextRequest(new URL(url), { method, headers });
}

describe("CSRF middleware", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // --- GET / HEAD / OPTIONS passthrough ---

  it("passes GET requests without checking origin", async () => {
    const res = middleware(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("passes HEAD requests without checking origin", async () => {
    const res = middleware(makeRequest("HEAD"));
    expect(res.status).toBe(200);
  });

  it("passes OPTIONS requests without checking origin", async () => {
    const res = middleware(makeRequest("OPTIONS"));
    expect(res.status).toBe(200);
  });

  // --- Same-origin mutations pass ---

  it("allows POST with same origin", async () => {
    const res = middleware(makeRequest("POST", "http://localhost:3000/api/collection", "http://localhost:3000"));
    expect(res.status).toBe(200);
  });

  it("allows PUT with same origin", async () => {
    const res = middleware(makeRequest("PUT", "http://localhost:3000/api/collection", "http://localhost:3000"));
    expect(res.status).toBe(200);
  });

  it("allows DELETE with same origin", async () => {
    const res = middleware(makeRequest("DELETE", "http://localhost:3000/api/collection", "http://localhost:3000"));
    expect(res.status).toBe(200);
  });

  it("allows PATCH with same origin", async () => {
    const res = middleware(makeRequest("PATCH", "http://localhost:3000/api/collection", "http://localhost:3000"));
    expect(res.status).toBe(200);
  });

  // --- Cross-origin mutations blocked ---

  it("blocks POST from different origin", async () => {
    const res = middleware(makeRequest("POST", "http://localhost:3000/api/collection", "https://evil.com"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("CSRF");
  });

  it("blocks DELETE from different origin", async () => {
    const res = middleware(makeRequest("DELETE", "http://localhost:3000/api/collection", "https://evil.com"));
    expect(res.status).toBe(403);
  });

  it("blocks PUT from different origin", async () => {
    const res = middleware(makeRequest("PUT", "http://localhost:3000/api/collection", "https://evil.com"));
    expect(res.status).toBe(403);
  });

  it("blocks PATCH from different origin", async () => {
    const res = middleware(makeRequest("PATCH", "http://localhost:3000/api/collection", "https://evil.com"));
    expect(res.status).toBe(403);
  });

  // --- Missing origin allowed ---

  it("allows POST with no Origin header (curl/server-to-server)", async () => {
    const res = middleware(makeRequest("POST", "http://localhost:3000/api/collection", null));
    expect(res.status).toBe(200);
  });

  it("allows DELETE with no Origin header", async () => {
    const res = middleware(makeRequest("DELETE", "http://localhost:3000/api/collection", null));
    expect(res.status).toBe(200);
  });

  // --- ALLOWED_ORIGINS env var ---

  it("allows cross-origin POST when origin is in ALLOWED_ORIGINS", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "https://trusted.com,https://staging.example.com");
    const res = middleware(makeRequest("POST", "http://localhost:3000/api/collection", "https://trusted.com"));
    expect(res.status).toBe(200);
  });

  it("still blocks unlisted origins even with ALLOWED_ORIGINS set", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "https://trusted.com");
    const res = middleware(makeRequest("POST", "http://localhost:3000/api/collection", "https://evil.com"));
    expect(res.status).toBe(403);
  });

  it("handles whitespace in ALLOWED_ORIGINS gracefully", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", " https://trusted.com , https://other.com ");
    const res = middleware(makeRequest("POST", "http://localhost:3000/api/collection", "https://trusted.com"));
    expect(res.status).toBe(200);
  });

  // --- Response format ---

  it("returns JSON error body on 403", async () => {
    const res = middleware(makeRequest("POST", "http://localhost:3000/api/collection", "https://evil.com"));
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
