import { http, HttpResponse } from "msw";

// Spotify API handlers
export const spotifyHandlers = [
  // Token exchange
  http.post("https://accounts.spotify.com/api/token", async ({ request }) => {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const grantType = params.get("grant_type");

    if (grantType === "authorization_code") {
      const code = params.get("code");
      if (code === "invalid_code") {
        return HttpResponse.json(
          { error: "invalid_grant", error_description: "Invalid authorization code" },
          { status: 400 }
        );
      }
      return HttpResponse.json({
        access_token: "mock_access_token",
        token_type: "Bearer",
        scope: "user-read-email user-read-private user-top-read user-library-read user-read-recently-played",
        expires_in: 3600,
        refresh_token: "mock_refresh_token",
      });
    }

    if (grantType === "refresh_token") {
      const refreshToken = params.get("refresh_token");
      if (refreshToken === "expired_refresh_token") {
        return HttpResponse.json(
          { error: "invalid_grant", error_description: "Refresh token revoked" },
          { status: 400 }
        );
      }
      return HttpResponse.json({
        access_token: "new_mock_access_token",
        token_type: "Bearer",
        scope: "user-read-email user-read-private user-top-read user-library-read user-read-recently-played",
        expires_in: 3600,
      });
    }

    return HttpResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }),

  // Current user profile
  http.get("https://api.spotify.com/v1/me", ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return HttpResponse.json({ error: { message: "No token provided" } }, { status: 401 });
    }
    const token = auth.replace("Bearer ", "");
    if (token === "expired_token") {
      return HttpResponse.json({ error: { message: "The access token expired" } }, { status: 401 });
    }
    return HttpResponse.json({
      id: "spotify_user_123",
      display_name: "Test User",
      email: "test@example.com",
      images: [{ url: "https://example.com/avatar.jpg" }],
    });
  }),

  // Top tracks
  http.get("https://api.spotify.com/v1/me/top/tracks", ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (!auth || auth === "Bearer expired_token") {
      return HttpResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }
    return HttpResponse.json({
      items: [
        {
          id: "track1",
          name: "Test Track 1",
          album: {
            id: "album1",
            name: "Test Album 1",
            artists: [{ name: "Test Artist 1" }],
            images: [{ url: "https://example.com/album1.jpg" }],
          },
        },
        {
          id: "track2",
          name: "Test Track 2",
          album: {
            id: "album2",
            name: "Test Album 2",
            artists: [{ name: "Test Artist 2" }],
            images: [{ url: "https://example.com/album2.jpg" }],
          },
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
  }),

  // Saved albums
  http.get("https://api.spotify.com/v1/me/albums", ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (!auth || auth === "Bearer expired_token") {
      return HttpResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }
    return HttpResponse.json({
      items: [
        {
          album: {
            id: "saved_album1",
            name: "Saved Album 1",
            artists: [{ name: "Saved Artist 1" }],
            images: [{ url: "https://example.com/saved1.jpg" }],
          },
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
  }),

  // Recently played
  http.get("https://api.spotify.com/v1/me/player/recently-played", ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (!auth || auth === "Bearer expired_token") {
      return HttpResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }
    return HttpResponse.json({
      items: [
        {
          track: {
            id: "recent_track1",
            name: "Recent Track 1",
            album: {
              id: "recent_album1",
              name: "Recent Album 1",
              artists: [{ name: "Recent Artist 1" }],
              images: [{ url: "https://example.com/recent1.jpg" }],
            },
          },
          played_at: "2024-01-15T12:00:00Z",
        },
      ],
    });
  }),
];

// Discogs API handlers
export const discogsHandlers = [
  // Search endpoint
  http.get("https://api.discogs.com/database/search", ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q");
    const format = url.searchParams.get("format");

    // Check for authorization
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Discogs token=")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Simulate rate limiting
    if (query?.includes("rate_limit_test")) {
      return HttpResponse.json(
        { message: "You are making requests too quickly." },
        { status: 429 }
      );
    }

    // Simulate no results
    if (query?.includes("no_results_test")) {
      return HttpResponse.json({
        pagination: { page: 1, pages: 1, per_page: 5, items: 0 },
        results: [],
      });
    }

    // Return mock vinyl results
    if (format === "Vinyl") {
      return HttpResponse.json({
        pagination: { page: 1, pages: 1, per_page: 5, items: 2 },
        results: [
          {
            id: 12345,
            title: "Test Artist - Test Album",
            year: "2020",
            format: ["Vinyl", "LP", "Album"],
            label: ["Test Records"],
            type: "release",
            thumb: "https://example.com/thumb.jpg",
            cover_image: "https://example.com/cover.jpg",
            uri: "/release/12345",
            resource_url: "https://api.discogs.com/releases/12345",
          },
          {
            id: 12346,
            title: "Test Artist - Test Album (Reissue)",
            year: "2023",
            format: ["Vinyl", "LP", "Album", "Reissue"],
            label: ["Test Records"],
            type: "release",
            thumb: "https://example.com/thumb2.jpg",
            cover_image: "https://example.com/cover2.jpg",
            uri: "/release/12346",
            resource_url: "https://api.discogs.com/releases/12346",
          },
        ],
      });
    }

    return HttpResponse.json({
      pagination: { page: 1, pages: 0, per_page: 5, items: 0 },
      results: [],
    });
  }),
];

export const handlers = [...spotifyHandlers, ...discogsHandlers];
