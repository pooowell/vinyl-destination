import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mocks that can be used in vi.mock factory
const { mockGet, mockSet, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
  }),
}));

vi.mock("@/lib/db", () => ({
  getUser: vi.fn(),
  updateUserTokens: vi.fn(),
}));

vi.mock("@/lib/spotify", () => ({
  refreshAccessToken: vi.fn(),
}));

import { generateState } from "@/lib/auth";

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
});
