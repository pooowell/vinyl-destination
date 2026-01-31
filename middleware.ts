import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF Protection Middleware
 *
 * Verifies the Origin header on mutating requests (POST, PUT, DELETE, PATCH)
 * to /api/* routes. Rejects cross-origin mutations with 403.
 *
 * Decision: Requests with NO Origin header are ALLOWED. This permits
 * server-to-server calls, curl, and mobile apps that don't send Origin.
 * Browsers always send Origin on cross-origin requests, so CSRF attacks
 * from browsers are still blocked.
 *
 * Configure additional allowed origins via the ALLOWED_ORIGINS env var
 * (comma-separated, e.g. "https://example.com,https://staging.example.com").
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function getAllowedOrigins(requestOrigin: string): Set<string> {
  const origins = new Set<string>([requestOrigin]);
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    for (const o of envOrigins.split(",")) {
      const trimmed = o.trim();
      if (trimmed) origins.add(trimmed);
    }
  }
  return origins;
}

export function middleware(request: NextRequest): NextResponse {
  // Only check mutating methods
  if (!MUTATING_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");

  // Allow requests with no Origin header (curl, server-to-server, etc.)
  if (!origin) {
    return NextResponse.next();
  }

  const allowedOrigins = getAllowedOrigins(request.nextUrl.origin);

  if (!allowedOrigins.has(origin)) {
    return new NextResponse(
      JSON.stringify({ error: "CSRF validation failed: origin not allowed" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
