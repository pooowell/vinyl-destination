import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getCurrentUser } from "@/lib/spotify";
import { upsertUser } from "@/lib/db";
import {
  getStateCookie,
  clearStateCookie,
  setSessionCookie,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  // Handle errors from Spotify
  if (error) {
    console.error("Spotify auth error:", error);
    return NextResponse.redirect(`${baseUrl}?error=${error}`);
  }

  // Verify state
  const savedState = await getStateCookie();
  console.log("State check - received:", state, "saved:", savedState);
  if (!state || state !== savedState) {
    console.error("State mismatch - received:", state, "saved:", savedState);
    // In development, skip state check if cookie is missing (common issue with localhost)
    if (process.env.NODE_ENV === "development" && !savedState && state) {
      console.warn("Skipping state validation in development mode");
    } else {
      return NextResponse.redirect(`${baseUrl}?error=state_mismatch`);
    }
  }

  await clearStateCookie();

  if (!code) {
    return NextResponse.redirect(`${baseUrl}?error=no_code`);
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user profile
    const spotifyUser = await getCurrentUser(tokens.access_token);

    // Calculate token expiration timestamp
    const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    // Save user to database
    await upsertUser({
      id: spotifyUser.id,
      display_name: spotifyUser.display_name,
      email: spotifyUser.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
    });

    // Set session cookie
    await setSessionCookie(spotifyUser.id);

    // Redirect to recommendations page
    return NextResponse.redirect(`${baseUrl}/recommendations`);
  } catch (err) {
    console.error("Auth callback error:", err);
    return NextResponse.redirect(`${baseUrl}?error=auth_failed`);
  }
}
