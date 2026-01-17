import type { SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

// Dynamic import to prevent any build-time initialization
export async function getSupabase(): Promise<SupabaseClient> {
  if (!supabaseInstance) {
    const { createClient } = await import("@supabase/supabase-js");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new Error(
        `Missing Supabase environment variables. URL: ${supabaseUrl ? "set" : "missing"}, Key: ${supabaseSecretKey ? "set" : "missing"}`
      );
    }

    supabaseInstance = createClient(supabaseUrl, supabaseSecretKey);
  }
  return supabaseInstance;
}
