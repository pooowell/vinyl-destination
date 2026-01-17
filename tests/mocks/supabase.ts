import { vi } from "vitest";

// Mock Supabase query builder
export const createMockQueryBuilder = (mockData: unknown = null, mockError: unknown = null) => {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};

  builder.from = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.upsert = vi.fn().mockReturnValue(builder);
  builder.delete = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.neq = vi.fn().mockReturnValue(builder);
  builder.gt = vi.fn().mockReturnValue(builder);
  builder.gte = vi.fn().mockReturnValue(builder);
  builder.lt = vi.fn().mockReturnValue(builder);
  builder.lte = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue({ data: mockData, error: mockError });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: mockData, error: mockError });

  // Make all methods return a promise with data/error when awaited directly
  builder.then = vi.fn((resolve) => resolve({ data: mockData, error: mockError }));

  return builder;
};

// Create a mock Supabase client
export const createMockSupabaseClient = () => {
  return {
    from: vi.fn((_table: string) => createMockQueryBuilder()),
  };
};

// Helper to mock getSupabase
export const mockGetSupabase = (mockClient = createMockSupabaseClient()) => {
  vi.doMock("@/lib/supabase", () => ({
    getSupabase: vi.fn().mockResolvedValue(mockClient),
  }));
  return mockClient;
};
