import { createClient } from "@supabase/supabase-js";

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key if available for server operations, falling back to anon key
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL and key) are not set. Check your .env.local file.",
    );
  }

  return createClient(url, key);
}
