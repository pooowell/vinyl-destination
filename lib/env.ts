import { z } from "zod";

const envSchema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1, "SPOTIFY_CLIENT_ID is required"),
  SPOTIFY_CLIENT_SECRET: z.string().min(1, "SPOTIFY_CLIENT_SECRET is required"),
  NEXT_PUBLIC_BASE_URL: z.string().min(1, "NEXT_PUBLIC_BASE_URL is required").default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  DISCOGS_TOKEN: z.string().min(1, "DISCOGS_TOKEN is required"),
  DATABASE_PATH: z.string().min(1, "DATABASE_PATH is required").default("./data/vinyl.db"),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
    );
    throw new Error(
      `❌ Missing or invalid environment variables:\n${missing.join("\n")}`
    );
  }

  return result.data;
}

export const env = parseEnv();
