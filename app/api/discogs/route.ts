import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkVinylAvailability } from "@/lib/discogs";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const artist = searchParams.get("artist");
    const album = searchParams.get("album");

    if (!artist || !album) {
      return NextResponse.json(
        { error: "Missing artist or album parameter" },
        { status: 400 }
      );
    }

    const result = await checkVinylAvailability(artist, album);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Error checking vinyl availability", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to check vinyl availability" },
      { status: 500 }
    );
  }
}
