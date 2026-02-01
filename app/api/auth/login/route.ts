import { NextRequest, NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify";
import { generateState, setStateCookie } from "@/lib/auth";
import { applyRateLimit, authLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, authLimiter);
  if (blocked) return blocked;

  const state = generateState();
  await setStateCookie(state);

  const authUrl = getSpotifyAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
