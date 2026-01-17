import { NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify";
import { generateState, setStateCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = generateState();
  await setStateCookie(state);

  const authUrl = getSpotifyAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
