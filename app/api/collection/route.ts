import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  setAlbumStatus,
  getUserAlbumsByStatus,
  removeAlbumStatus,
} from "@/lib/db";

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
    console.error("Error fetching collection:", error);
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
    const { albumId, albumName, artistName, imageUrl, status } = body;

    if (!albumId || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (status !== "owned" && status !== "wishlist" && status !== "skipped" && status !== "not_interested") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await setAlbumStatus(
      auth.userId,
      {
        album_id: albumId,
        album_name: albumName || "",
        artist_name: artistName || "",
        image_url: imageUrl || "",
      },
      status
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating collection:", error);
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
    const albumId = searchParams.get("albumId");

    if (!albumId) {
      return NextResponse.json(
        { error: "Missing albumId" },
        { status: 400 }
      );
    }

    await removeAlbumStatus(auth.userId, albumId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing from collection:", error);
    return NextResponse.json(
      { error: "Failed to remove from collection" },
      { status: 500 }
    );
  }
}
