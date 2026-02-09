/**
 * Supabase Client Utilities
 * For use in Client Components
 * Next.js 16 + React 19 optimized
 */

import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for Client Components
 * Singleton pattern ensures one instance across the app
 */
let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClientSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  supabaseClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return supabaseClient;
}

/**
 * Get the singleton Supabase client instance
 * Use this in Client Components
 */
export function getSupabase() {
  return createClientSupabaseClient();
}
