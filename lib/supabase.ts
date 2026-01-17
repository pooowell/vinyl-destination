import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use the secret key for server-side operations (bypasses RLS)
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!;

export const supabase = createClient(supabaseUrl, supabaseSecretKey);
