# Vinyl Destination

A Next.js web app that recommends vinyl albums based on Spotify listening history.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Spotify OAuth
- **APIs**: Spotify API, Discogs API
- **Styling**: Tailwind CSS
- **Hosting**: Vercel

## Project Structure

```
app/
  api/
    auth/           # OAuth routes (login, callback, logout)
    collection/     # User album collection CRUD
    recommendations/# Album recommendations + streaming
    discogs/        # Vinyl availability checks
lib/
  auth.ts           # Auth utilities, session management
  db.ts             # Supabase database operations
  discogs.ts        # Discogs API client
  spotify.ts        # Spotify API client
  supabase.ts       # Supabase client (lazy init for Vercel)
```

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
npm run test:coverage # Run tests with coverage
```

## Testing

Tests are organized by type:
- `tests/unit/**/*.spec.ts` - Unit tests with manual mocks
- `tests/integration/**/*.test.ts` - Integration tests with MSW

MSW handlers mock Spotify and Discogs APIs for realistic integration testing.

## Deployment

Using preview → promote workflow:

1. Push to feature branch → creates Vercel preview
2. Test preview URL
3. `vercel promote <preview-url> --prod`
4. Merge to main

## Environment Variables

Required in `.env.local` and Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `DISCOGS_TOKEN`
- `NEXTAUTH_SECRET`
- `NEXT_PUBLIC_BASE_URL`

## Key Implementation Notes

- Supabase client uses dynamic import to prevent build-time initialization errors on Vercel
- All API routes use `export const dynamic = "force-dynamic"` for cookie access
- Discogs has in-memory cache (5 min) + database cache (7 days) for vinyl lookups
- Spotify is in Development Mode - only registered users can authenticate
