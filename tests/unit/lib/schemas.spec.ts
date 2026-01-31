import { describe, it, expect } from "vitest";
import {
  collectionPostSchema,
  collectionDeleteSchema,
  albumStatusEnum,
} from "@/lib/schemas";

describe("albumStatusEnum", () => {
  it.each(["owned", "wishlist", "skipped", "not_interested"])(
    "accepts valid status '%s'",
    (status) => {
      expect(albumStatusEnum.parse(status)).toBe(status);
    }
  );

  it("rejects invalid status", () => {
    expect(() => albumStatusEnum.parse("invalid")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => albumStatusEnum.parse("")).toThrow();
  });

  it("rejects number", () => {
    expect(() => albumStatusEnum.parse(42)).toThrow();
  });
});

describe("collectionPostSchema", () => {
  const validBody = {
    albumId: "abc123",
    status: "owned",
  };

  it("parses a minimal valid body (albumId + status)", () => {
    const result = collectionPostSchema.parse(validBody);
    expect(result.albumId).toBe("abc123");
    expect(result.status).toBe("owned");
    expect(result.albumName).toBeUndefined();
    expect(result.artistName).toBeUndefined();
    expect(result.imageUrl).toBeUndefined();
  });

  it("parses a full valid body with all optional fields", () => {
    const result = collectionPostSchema.parse({
      albumId: "abc123",
      albumName: "OK Computer",
      artistName: "Radiohead",
      imageUrl: "https://example.com/cover.jpg",
      status: "wishlist",
    });
    expect(result.albumName).toBe("OK Computer");
    expect(result.artistName).toBe("Radiohead");
    expect(result.imageUrl).toBe("https://example.com/cover.jpg");
    expect(result.status).toBe("wishlist");
  });

  it("trims whitespace from string fields", () => {
    const result = collectionPostSchema.parse({
      albumId: "  abc123  ",
      albumName: "  OK Computer  ",
      artistName: "  Radiohead  ",
      status: "owned",
    });
    expect(result.albumId).toBe("abc123");
    expect(result.albumName).toBe("OK Computer");
    expect(result.artistName).toBe("Radiohead");
  });

  it("allows empty string for imageUrl", () => {
    const result = collectionPostSchema.parse({
      ...validBody,
      imageUrl: "",
    });
    expect(result.imageUrl).toBe("");
  });

  it("rejects invalid imageUrl (not a URL)", () => {
    expect(() =>
      collectionPostSchema.parse({
        ...validBody,
        imageUrl: "not-a-url",
      })
    ).toThrow();
  });

  it("rejects missing albumId", () => {
    expect(() =>
      collectionPostSchema.parse({ status: "owned" })
    ).toThrow();
  });

  it("rejects empty albumId after trimming", () => {
    expect(() =>
      collectionPostSchema.parse({ albumId: "   ", status: "owned" })
    ).toThrow();
  });

  it("rejects missing status", () => {
    expect(() =>
      collectionPostSchema.parse({ albumId: "abc123" })
    ).toThrow();
  });

  it("rejects invalid status value", () => {
    expect(() =>
      collectionPostSchema.parse({ albumId: "abc123", status: "nope" })
    ).toThrow();
  });

  it("rejects numeric albumId", () => {
    expect(() =>
      collectionPostSchema.parse({ albumId: 123, status: "owned" })
    ).toThrow();
  });

  it("rejects null albumId", () => {
    expect(() =>
      collectionPostSchema.parse({ albumId: null, status: "owned" })
    ).toThrow();
  });

  it("provides meaningful error messages", () => {
    const result = collectionPostSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((e) => e.path[0]);
      expect(paths).toContain("albumId");
      expect(paths).toContain("status");
    }
  });

  it("accepts all four valid statuses", () => {
    for (const status of ["owned", "wishlist", "skipped", "not_interested"]) {
      const result = collectionPostSchema.parse({ albumId: "x", status });
      expect(result.status).toBe(status);
    }
  });
});

describe("collectionDeleteSchema", () => {
  it("parses a valid albumId", () => {
    const result = collectionDeleteSchema.parse({ albumId: "abc123" });
    expect(result.albumId).toBe("abc123");
  });

  it("trims whitespace from albumId", () => {
    const result = collectionDeleteSchema.parse({ albumId: "  abc123  " });
    expect(result.albumId).toBe("abc123");
  });

  it("rejects missing albumId", () => {
    expect(() => collectionDeleteSchema.parse({})).toThrow();
  });

  it("rejects empty albumId after trimming", () => {
    expect(() => collectionDeleteSchema.parse({ albumId: "   " })).toThrow();
  });

  it("rejects undefined albumId", () => {
    expect(() =>
      collectionDeleteSchema.parse({ albumId: undefined })
    ).toThrow();
  });

  it("rejects numeric albumId", () => {
    expect(() =>
      collectionDeleteSchema.parse({ albumId: 123 })
    ).toThrow();
  });
});
