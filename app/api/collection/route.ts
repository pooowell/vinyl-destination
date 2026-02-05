import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  setAlbumStatus,
  getUserAlbumsByStatus,
  removeAlbumStatus,
} from "@/lib/db";
import { collectionPostSchema, collectionDeleteSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // If specific status requested, return just that
    if (status === "not_interested") {
      const notInterestedAlbums = await getUserAlbumsByStatus(auth.userId, "not_interested");
      return NextResponse.json({
        notInterested: notInterestedAlbums.map((album) => ({
          id: album.album_id,
          name: album.album_name,
          artist: album.artist_name,
          imageUrl: album.image_url,
          addedAt: album.created_at,
        })),
      });
    }

    // Default: return owned and wishlist
    const ownedAlbums = await getUserAlbumsByStatus(auth.userId, "owned");
    const wishlistAlbums = await getUserAlbumsByStatus(auth.userId, "wishlist");

    const formatAlbum = (album: {
      album_id: string;
      album_name: string | null;
      artist_name: string | null;
      image_url: string | null;
      created_at: number;
    }) => ({
      id: album.album_id,
      name: album.album_name,
      artist: album.artist_name,
      imageUrl: album.image_url,
      addedAt: album.created_at,
    });

    return NextResponse.json({
      owned: ownedAlbums.map(formatAlbum),
      wishlist: wishlistAlbums.map(formatAlbum),
    });
  } catch (error) {
    logger.error("Error fetching collection", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = collectionPostSchema.parse(body);

    await setAlbumStatus(
      auth.userId,
      {
        album_id: parsed.albumId,
        album_name: parsed.albumName ?? "",
        artist_name: parsed.artistName ?? "",
        image_url: parsed.imageUrl ?? "",
      },
      parsed.status
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    logger.error("Error updating collection", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to update collection" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = collectionDeleteSchema.parse({
      albumId: searchParams.get("albumId") ?? undefined,
    });

    await removeAlbumStatus(auth.userId, parsed.albumId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    logger.error("Error removing from collection", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to remove from collection" },
      { status: 500 }
    );
  }
}
