# Spotify Vinyl Finder

A Next.js web app that recommends vinyl albums based on your Spotify listening history, with collection tracking.

## Features

- **Spotify Integration**: Connects to your Spotify account to analyze your top tracks, saved albums, and recently played music
- **Vinyl Discovery**: Checks Discogs for vinyl availability of your favorite albums
- **Collection Tracking**: Mark albums you own or aren't interested in to personalize recommendations
- **Persistent Storage**: SQLite database keeps track of your collection across sessions

## Getting Started

### Prerequisites

- Node.js 18+
- A Spotify Developer account
- A Discogs account

### API Credentials Setup

#### Spotify

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in the app details:
   - App name: Vinyl Finder (or your choice)
   - App description: Find vinyl for my Spotify music
   - Redirect URI: `http://127.0.0.1:3000/api/auth/callback` (use explicit IP, not localhost)
4. Accept the terms and create the app
5. Copy the **Client ID** and **Client Secret**

#### Discogs

1. Go to [Discogs Developer Settings](https://www.discogs.com/settings/developers)
2. Click "Generate new token"
3. Copy the personal access token

### Installation

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd spotify-vinyl-search
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your environment file:
   ```bash
   cp .env.local.example .env.local
   ```

4. Edit `.env.local` with your credentials:
   ```
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   DISCOGS_TOKEN=your_discogs_token
   NEXTAUTH_SECRET=your_random_secret_string
   NEXT_PUBLIC_BASE_URL=http://127.0.0.1:3000
   ```

   Generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser

## Usage

1. **Login**: Click "Login with Spotify" to authenticate with your Spotify account
2. **Browse Recommendations**: View albums from your listening history; hover over albums to check vinyl availability on Discogs
3. **Build Your Collection**:
   - Click "Own it" for albums you have on vinyl
   - Click "Not interested" to hide albums you don't want
4. **View Collection**: Navigate to "My Collection" to see all your owned vinyl

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: SQLite via better-sqlite3
- **Styling**: Tailwind CSS
- **Authentication**: Spotify OAuth 2.0

## Project Structure

```
spotify-vinyl-search/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # API endpoints
│   │   ├── auth/          # OAuth routes
│   │   ├── collection/    # Collection CRUD
│   │   ├── discogs/       # Discogs proxy
│   │   └── recommendations/
│   ├── collection/        # Collection page
│   ├── recommendations/   # Recommendations page
│   └── page.tsx           # Landing page
├── components/            # React components
├── lib/                   # Utility libraries
│   ├── auth.ts           # Session management
│   ├── db.ts             # SQLite setup
│   ├── discogs.ts        # Discogs API client
│   └── spotify.ts        # Spotify API client
└── data/                  # SQLite database (auto-created)
```

## License

MIT
