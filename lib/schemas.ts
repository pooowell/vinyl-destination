import { z } from "zod";

/**
 * Valid statuses for albums in a user's collection.
 */
export const albumStatusEnum = z.enum([
  "owned",
  "wishlist",
  "skipped",
  "not_interested",
]);

export type AlbumStatus = z.infer<typeof albumStatusEnum>;

/**
 * Schema for POST /api/collection request body.
 */
export const collectionPostSchema = z.object({
  albumId: z
    .string({ required_error: "albumId is required" })
    .trim()
    .min(1, "albumId must not be empty"),
  albumName: z.string().trim().optional(),
  artistName: z.string().trim().optional(),
  imageUrl: z
    .string()
    .trim()
    .url("imageUrl must be a valid URL")
    .or(z.literal(""))
    .optional(),
  status: albumStatusEnum,
});

export type CollectionPostInput = z.infer<typeof collectionPostSchema>;

/**
 * Schema for DELETE /api/collection query params.
 */
export const collectionDeleteSchema = z.object({
  albumId: z
    .string({ required_error: "albumId is required" })
    .trim()
    .min(1, "albumId must not be empty"),
});

export type CollectionDeleteInput = z.infer<typeof collectionDeleteSchema>;
