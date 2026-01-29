import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const { mockGet, mockSet, mockDelete, mockGetUser, mockUpdateUserTokens, mockRefreshAccessToken } = vi.hoisted(() => ({
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

describe("auth - State Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateState", () => {
    it("should generate a 32-character hex string", () => {
      const state = generateState();
      expect(state).toMatch(/^[a-f0-9]{32}$/);
    });

    it("should generate unique states", () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(state1).not.toBe(state2);
    });
  });

  describe("setStateCookie", () => {
    it("should set oauth state cookie with correct options", async () => {
      await setStateCookie("test-state-123");

      expect(mockSet).toHaveBeenCalledWith("oauth_state", "test-state-123", {
        httpOnly: true,
        secure: false,
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
});

describe("auth - Session Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("setSessionCookie", () => {
    it("should set encrypted session cookie", async () => {
      await setSessionCookie("user-123");

      expect(mockSet).toHaveBeenCalledWith(
        "spotify_session",
        expect.any(String), // Encrypted value
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          maxAge: 604800, // 1 week
          path: "/",
        })
      );

      // Verify the value is encrypted (contains : separator for IV)
      const encryptedValue = mockSet.mock.calls[0][1];
      expect(encryptedValue).toContain(":");
    });
  });

  describe("getSessionUserId", () => {
    it("should return null when no session cookie", async () => {
      mockGet.mockReturnValue(undefined);

      const result = await getSessionUserId();

      expect(result).toBeNull();
    });

    it("should return null for invalid encrypted value", async () => {
      mockGet.mockReturnValue({ value: "invalid-not-encrypted" });

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

describe("auth - Authenticated User", () => {
  /**
   * Helper: creates a real encrypted session cookie via setSessionCookie,
   * captures the encrypted value from mockSet, then configures mockGet
   * to return it. This ensures getSessionUserId decrypts a valid userId
   * so tests actually reach DB/refresh branches.
   */
  async function setupValidSession(userId: string): Promise<void> {
    await setSessionCookie(userId);
    const encryptedValue = mockSet.mock.calls[0][1] as string;
    vi.clearAllMocks();
    mockGet.mockReturnValue({ value: encryptedValue });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAuthenticatedUser", () => {
    it("should return null when no session", async () => {
      mockGet.mockReturnValue(undefined);

      const result = await getAuthenticatedUser();

      expect(result).toBeNull();
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("should return null when user not found in database", async () => {
      await setupValidSession("user-123");
      mockGetUser.mockResolvedValue(null);

      const result = await getAuthenticatedUser();

      expect(result).toBeNull();
      expect(mockGetUser).toHaveBeenCalledWith("user-123");
    });

    it("should return null when user has no tokens", async () => {
      await setupValidSession("user-123");
      mockGetUser.mockResolvedValue({
        id: "user-123",
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
      });

      const result = await getAuthenticatedUser();

      expect(result).toBeNull();
      expect(mockGetUser).toHaveBeenCalledWith("user-123");
    });

    it("should refresh token when expired", async () => {
      await setupValidSession("user-123");

      const expiredTime = Math.floor(Date.now() / 1000) - 60;
      mockGetUser.mockResolvedValue({
        id: "user-123",
        access_token: "old-access-token",
        refresh_token: "my-refresh-token",
        token_expires_at: expiredTime,
      });
      mockRefreshAccessToken.mockResolvedValue({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
      });
      mockUpdateUserTokens.mockResolvedValue(undefined);

      const result = await getAuthenticatedUser();

      expect(result).toEqual({
        userId: "user-123",
        accessToken: "new-access-token",
      });
      expect(mockRefreshAccessToken).toHaveBeenCalledWith("my-refresh-token");
      expect(mockUpdateUserTokens).toHaveBeenCalledWith(
        "user-123",
        "new-access-token",
        "new-refresh-token",
        expect.any(Number)
      );
    });

    it("should return null when token refresh fails", async () => {
      await setupValidSession("user-123");

      const expiredTime = Math.floor(Date.now() / 1000) - 60;
      mockGetUser.mockResolvedValue({
        id: "user-123",
        access_token: "old-access-token",
        refresh_token: "my-refresh-token",
        token_expires_at: expiredTime,
      });
      mockRefreshAccessToken.mockRejectedValue(new Error("Refresh failed"));

      const result = await getAuthenticatedUser();

      expect(result).toBeNull();
      expect(mockRefreshAccessToken).toHaveBeenCalledWith("my-refresh-token");
    });

    it("should return user without refresh when token is still valid", async () => {
      await setupValidSession("user-123");

      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      mockGetUser.mockResolvedValue({
        id: "user-123",
        access_token: "valid-access-token",
        refresh_token: "my-refresh-token",
        token_expires_at: futureTime,
      });

      const result = await getAuthenticatedUser();

      expect(result).toEqual({
        userId: "user-123",
        accessToken: "valid-access-token",
      });
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    });
  });
});

describe("auth - Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle cookie read errors gracefully", async () => {
    mockGet.mockImplementation(() => {
      throw new Error("Cookie read error");
    });

    // getStateCookie should throw
    await expect(getStateCookie()).rejects.toThrow();
  });

  it("should handle decryption errors gracefully", async () => {
    mockGet.mockReturnValue({ value: "bad:encrypted:value:extra" });

    const result = await getSessionUserId();

    expect(result).toBeNull();
  });
});
