import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import LoginButton from "@/components/LoginButton";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const userId = await getSessionUserId();

  if (userId) {
    redirect("/recommendations");
  }

  const params = await searchParams;
  const error = params.error;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center">
        <div className="mb-8">
          <svg
            className="w-24 h-24 mx-auto text-spotify-green"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
          </svg>
        </div>

        <h1 className="text-5xl font-bold mb-4">Vinyl Finder</h1>
        <p className="text-xl text-zinc-400 mb-8">
          Discover which of your favorite Spotify albums are available on vinyl.
          Build and track your vinyl collection.
        </p>

        <div className="space-y-6">
          <LoginButton />

          {error && (
            <p className="text-red-500 text-sm">
              Authentication failed. Please try again.
            </p>
          )}
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="bg-zinc-900 rounded-lg p-6">
            <div className="text-spotify-green text-2xl mb-2">1</div>
            <h3 className="font-semibold mb-2">Connect Spotify</h3>
            <p className="text-sm text-zinc-400">
              Log in with your Spotify account to access your listening history
            </p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-6">
            <div className="text-spotify-green text-2xl mb-2">2</div>
            <h3 className="font-semibold mb-2">Get Recommendations</h3>
            <p className="text-sm text-zinc-400">
              See which albums you love are available on vinyl via Discogs
            </p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-6">
            <div className="text-spotify-green text-2xl mb-2">3</div>
            <h3 className="font-semibold mb-2">Track Collection</h3>
            <p className="text-sm text-zinc-400">
              Mark albums you own and build your vinyl collection
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
