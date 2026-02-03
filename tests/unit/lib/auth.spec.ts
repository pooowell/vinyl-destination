import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const {
  mockGet,
  mockSet,
  mockDelete,
  mockGetUser,
  mockUpdateUserTokens,
  mockRefreshAccessToken,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
  mockGetUser: vi.fn(),
  mockUpdateUserTokens: vi.fn(),
  mockRefreshAccessToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
  }),
}));

vi.mock("@/lib/db", () => ({
  getUser: mockGetUser,
  updateUserTokens: mockUpdateUserTokens,
}));

vi.mock("@/lib/spotify", () => ({
  refreshAccessToken: mockRefreshAccessToken,
}));

import {
  generateState,
  setStateCookie,
  getStateCookie,
  clearStateCookie,
  setSessionCookie,
  getSessionUserId,
  clearSessionCookie,
  getAuthenticatedUser,
} from "@/lib/auth";

// Helper: call setSessionCookie, capture the encrypted value from mockSet,
// then wire mockGet so getSessionUserId can decrypt it.
async function setAndCaptureSession(userId: string): Promise<string> {
  await setSessionCookie(userId);
  const encrypted: string = mockSet.mock.calls[mockSet.mock.calls.length - 1][1];
  mockGet.mockReturnValue({ value: encrypted });
  return encrypted;
}

describe("auth - State Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateState", () => {
    it("should generate a 32-character hex string", () => {
      const state = generateState();
      expect(state).toMatch(/^[a-f0-9]{32}$/);
    });

    it("should generate unique states on each call", () => {
      const states = new Set(Array.from({ length: 10 }, () => generateState()));
      expect(states.size).toBe(10);
    });
  });

  describe("setStateCookie", () => {
    it("should set oauth state cookie with correct options", async () => {
      await setStateCookie("test-state-123");

      expect(mockSet).toHaveBeenCalledWith("oauth_state", "test-state-123", {
        httpOnly: true,
        secure: false, // NODE_ENV != production in tests
        sameSite: "lax",
        maxAge: 600, // 10 minutes
        path: "/",
      });
    });
  });

  describe("getStateCookie", () => {
    it("should return state cookie value when present", async () => {
      mockGet.mockReturnValue({ value: "stored-state-456" });

      const result = await getStateCookie();

      expect(mockGet).toHaveBeenCalledWith("oauth_state");
      expect(result).toBe("stored-state-456");
    });

    it("should return undefined when cookie not present", async () => {
      mockGet.mockReturnValue(undefined);

      const result = await getStateCookie();

      expect(result).toBeUndefined();
    });
  });

  describe("clearStateCookie", () => {
    it("should delete the oauth state cookie", async () => {
      await clearStateCookie();

      expect(mockDelete).toHaveBeenCalledWith("oauth_state");
    });
  });

  describe("state cookie lifecycle", () => {
    it("should set, read, and clear state cookie", async () => {
      // Set
      await setStateCookie("lifecycle-state");
      expect(mockSet).toHaveBeenCalledWith(
        "oauth_state",
        "lifecycle-state",
        expect.any(Object),
      );

      // Read
      mockGet.mockReturnValue({ value: "lifecycle-state" });
      const value = await getStateCookie();
      expect(value).toBe("lifecycle-state");

      // Clear
      await clearStateCookie();
      expect(mockDelete).toHaveBeenCalledWith("oauth_state");
    });
  });
});

describe("auth - Session Management (encrypt / decrypt)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("setSessionCookie", () => {
    it("should set an encrypted session cookie with iv:ciphertext format", async () => {
      await setSessionCookie("user-123");

      expect(mockSet).toHaveBeenCalledWith(
        "spotify_session",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: 604800, // 1 week
          path: "/",
        }),
      );

      const encrypted: string = mockSet.mock.calls[0][1];
      // Must contain exactly one colon separating the IV hex from ciphertext hex
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(2);
      // IV should be 32 hex chars (16 bytes)
      expect(parts[0]).toMatch(/^[a-f0-9]{32}$/);
      // Ciphertext should be non-empty hex
      expect(parts[1]).toMatch(/^[a-f0-9]+$/);
    });

    it("should produce different ciphertext for same plaintext (random IV)", async () => {
      await setSessionCookie("same-user");
      const first: string = mockSet.mock.calls[0][1];

      mockSet.mockClear();
      await setSessionCookie("same-user");
      const second: string = mockSet.mock.calls[0][1];

      expect(first).not.toBe(second);
    });
  });

  describe("getSessionUserId — round-trip", () => {
    it("should decrypt what setSessionCookie encrypted", async () => {
      await setAndCaptureSession("user-abc-123");

      const userId = await getSessionUserId();
      expect(userId).toBe("user-abc-123");
    });

    it("should handle various user ID formats", async () => {
      for (const id of ["123", "spotify_user_abc", "a-b-c-d-e", "🎵"]) {
        mockSet.mockClear();
        await setAndCaptureSession(id);
        expect(await getSessionUserId()).toBe(id);
      }
    });

    it("should return null when no session cookie exists", async () => {
      mockGet.mockReturnValue(undefined);

      const result = await getSessionUserId();
      expect(result).toBeNull();
    });

    it("should return null for corrupted cookie value", async () => {
      mockGet.mockReturnValue({ value: "not-valid-encrypted-data" });

      const result = await getSessionUserId();
      expect(result).toBeNull();
    });

    it("should return null for truncated ciphertext", async () => {
      // Get a real encrypted value, then mangle it
      await setSessionCookie("user-x");
      const encrypted: string = mockSet.mock.calls[0][1];
      const [iv] = encrypted.split(":");
      mockGet.mockReturnValue({ value: `${iv}:deadbeef` });

      const result = await getSessionUserId();
      expect(result).toBeNull();
    });

    it("should return null for invalid IV hex", async () => {
      mockGet.mockReturnValue({ value: "zzzz:abcdef1234567890" });

      const result = await getSessionUserId();
      expect(result).toBeNull();
    });
  });

  describe("clearSessionCookie", () => {
    it("should delete the session cookie", async () => {
      await clearSessionCookie();
      expect(mockDelete).toHaveBeenCalledWith("spotify_session");
    });
  });
});

describe("auth - getAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when no session cookie", async () => {
    mockGet.mockReturnValue(undefined);

    const result = await getAuthenticatedUser();
    expect(result).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("should return null when user not found in database", async () => {
    await setAndCaptureSession("ghost-user");
    mockGetUser.mockResolvedValue(undefined);

    const result = await getAuthenticatedUser();
    expect(result).toBeNull();
  });

  it("should return null when user has no access_token", async () => {
    await setAndCaptureSession("user-no-access");
    mockGetUser.mockResolvedValue({
      id: "user-no-access",
      access_token: null,
      refresh_token: "some-refresh",
      token_expires_at: 9999999999,
    });

    const result = await getAuthenticatedUser();
    expect(result).toBeNull();
  });

  it("should return null when user has no refresh_token", async () => {
    await setAndCaptureSession("user-no-refresh");
    mockGetUser.mockResolvedValue({
      id: "user-no-refresh",
      access_token: "some-access",
      refresh_token: null,
      token_expires_at: 9999999999,
    });

    const result = await getAuthenticatedUser();
    expect(result).toBeNull();
  });

  it("should return user with valid (non-expired) token without refreshing", async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    await setAndCaptureSession("user-valid");
    mockGetUser.mockResolvedValue({
      id: "user-valid",
      access_token: "valid-access-token",
      refresh_token: "valid-refresh-token",
      token_expires_at: futureExpiry,
    });

    const result = await getAuthenticatedUser();

    expect(result).toEqual({
      userId: "user-valid",
      accessToken: "valid-access-token",
    });
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(mockUpdateUserTokens).not.toHaveBeenCalled();
  });

  it("should refresh token when expired (token_expires_at < now + 300)", async () => {
    const almostExpired = Math.floor(Date.now() / 1000) + 100; // expires in 100s (< 300s buffer)
    await setAndCaptureSession("user-expiring");
    mockGetUser.mockResolvedValue({
      id: "user-expiring",
      access_token: "old-access",
      refresh_token: "old-refresh",
      token_expires_at: almostExpired,
    });
    mockRefreshAccessToken.mockResolvedValue({
      access_token: "fresh-access",
      refresh_token: "fresh-refresh",
      expires_in: 3600,
    });
    mockUpdateUserTokens.mockResolvedValue(undefined);

    const result = await getAuthenticatedUser();

    expect(result).toEqual({
      userId: "user-expiring",
      accessToken: "fresh-access",
    });
    expect(mockRefreshAccessToken).toHaveBeenCalledWith("old-refresh");
    expect(mockUpdateUserTokens).toHaveBeenCalledWith(
      "user-expiring",
      "fresh-access",
      "fresh-refresh",
      expect.any(Number),
    );
  });

  it("should refresh token when already expired (in the past)", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 600; // expired 10 min ago
    await setAndCaptureSession("user-expired");
    mockGetUser.mockResolvedValue({
      id: "user-expired",
      access_token: "stale-access",
      refresh_token: "stale-refresh",
      token_expires_at: pastExpiry,
    });
    mockRefreshAccessToken.mockResolvedValue({
      access_token: "renewed-access",
      expires_in: 3600,
      // no refresh_token in response — should keep old one
    });
    mockUpdateUserTokens.mockResolvedValue(undefined);

    const result = await getAuthenticatedUser();

    expect(result).toEqual({
      userId: "user-expired",
      accessToken: "renewed-access",
    });
    // When no new refresh_token is returned, the old one should be preserved
    expect(mockUpdateUserTokens).toHaveBeenCalledWith(
      "user-expired",
      "renewed-access",
      "stale-refresh", // falls back to existing refresh_token
      expect.any(Number),
    );
  });

  it("should return null when token refresh fails", async () => {
    const almostExpired = Math.floor(Date.now() / 1000) + 100;
    await setAndCaptureSession("user-refresh-fail");
    mockGetUser.mockResolvedValue({
      id: "user-refresh-fail",
      access_token: "old-access",
      refresh_token: "bad-refresh",
      token_expires_at: almostExpired,
    });
    mockRefreshAccessToken.mockRejectedValue(new Error("refresh failed"));

    const result = await getAuthenticatedUser();

    expect(result).toBeNull();
    expect(mockRefreshAccessToken).toHaveBeenCalledWith("bad-refresh");
    expect(mockUpdateUserTokens).not.toHaveBeenCalled();
  });

  it("should skip refresh when token_expires_at is null (treat as valid)", async () => {
    await setAndCaptureSession("user-null-expiry");
    mockGetUser.mockResolvedValue({
      id: "user-null-expiry",
      access_token: "access-ok",
      refresh_token: "refresh-ok",
      token_expires_at: null,
    });

    const result = await getAuthenticatedUser();

    // token_expires_at is null, so the guard short-circuits and no refresh is triggered
    expect(result).toEqual({
      userId: "user-null-expiry",
      accessToken: "access-ok",
    });
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });
});

describe("auth - Cookie Secure Flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should set state cookie secure=false when NODE_ENV is not production", async () => {
    await setStateCookie("state-dev");

    expect(mockSet).toHaveBeenCalledWith(
      "oauth_state",
      "state-dev",
      expect.objectContaining({ secure: false }),
    );
  });

  it("should set session cookie secure=false when NODE_ENV is not production", async () => {
    await setSessionCookie("user-dev");

    expect(mockSet).toHaveBeenCalledWith(
      "spotify_session",
      expect.any(String),
      expect.objectContaining({ secure: false }),
    );
  });

  it("should use the same secure value for both state and session cookies", async () => {
    await setStateCookie("state-consistency");
    await setSessionCookie("user-consistency");

    const stateSecure = mockSet.mock.calls[0][2].secure;
    const sessionSecure = mockSet.mock.calls[1][2].secure;
    expect(stateSecure).toBe(sessionSecure);
  });
});
