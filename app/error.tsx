"use client";

import { useEffect } from "react";
import Navbar from "@/components/Navbar";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center max-w-md">
            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <p className="text-zinc-400 mb-6">
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={reset}
              className="px-6 py-2 bg-spotify-green text-black font-semibold rounded-full hover:brightness-110 transition-all"
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
