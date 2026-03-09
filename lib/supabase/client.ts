/**
 * Supabase Client Utilities
 * For use in Client Components
 * Next.js 16 + React 19 optimized
 */

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";

/**
 * Creates a Supabase client for Client Components
 * Singleton pattern ensures one instance across the app
 */
let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClientSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }
  const { url, anonOrPublishableKey } = getSupabasePublicEnv();

  supabaseClient = createBrowserClient(
    url,
    anonOrPublishableKey,
    {
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, cache: "no-store" }),
      },
    }
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
