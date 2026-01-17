import { cookies } from "next/headers";
import { getUser, updateUserTokens } from "./db";
import { refreshAccessToken } from "./spotify";
import crypto from "crypto";

const SESSION_COOKIE = "spotify_session";
const STATE_COOKIE = "oauth_state";

// Simple encryption for session data
function encrypt(text: string): string {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(process.env.NEXTAUTH_SECRET!, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(process.env.NEXTAUTH_SECRET!, "salt", 32);
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function setStateCookie(state: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });
}

export async function getStateCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(STATE_COOKIE)?.value;
}

export async function clearStateCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STATE_COOKIE);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const encrypted = encrypt(userId);
  cookieStore.set(SESSION_COOKIE, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: "/",
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);

  if (!sessionCookie) {
    return null;
  }

  try {
    return decrypt(sessionCookie.value);
  } catch {
    return null;
  }
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// Get current user with valid access token (refreshes if needed)
export async function getAuthenticatedUser(): Promise<{
  userId: string;
  accessToken: string;
} | null> {
  const userId = await getSessionUserId();
  if (!userId) {
    return null;
  }

  const user = getUser(userId);
  if (!user || !user.access_token || !user.refresh_token) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  const now = Math.floor(Date.now() / 1000);
  if (user.token_expires_at && user.token_expires_at < now + 300) {
    try {
      const newTokens = await refreshAccessToken(user.refresh_token);
      const expiresAt = now + newTokens.expires_in;
      updateUserTokens(
        userId,
        newTokens.access_token,
        newTokens.refresh_token || user.refresh_token,
        expiresAt
      );
      return { userId, accessToken: newTokens.access_token };
    } catch {
      // Refresh failed, user needs to re-authenticate
      return null;
    }
  }

  return { userId, accessToken: user.access_token };
}
