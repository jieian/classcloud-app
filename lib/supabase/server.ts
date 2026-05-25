/**
 * Supabase Server Utilities
 * For use in Server Components, Server Actions, and Route Handlers
 * Next.js 16 + React 19 optimized
 */

import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";
import type { User } from "@supabase/supabase-js";

/**
 * Creates a Supabase client for Server Components
 * Automatically handles cookie-based session management
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonOrPublishableKey } = getSupabasePublicEnv();

  return createServerClient(
    url,
    anonOrPublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Gets the current authenticated user from server-side.
 * Wrapped with React cache() so multiple server components or route handlers
 * calling this within the same request share one Auth round-trip instead of N.
 * cache() resets per request, so there is no cross-request data leakage.
 */
export const getServerUser = cache(async function getServerUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Reads the user's permissions directly from their verified JWT app_metadata.
 * Zero DB round-trip — permissions are written there by syncUserPermissions
 * whenever roles change, and supabase.auth.getUser() validates the JWT
 * server-side, so app_metadata is trustworthy.
 */
export function getPermissionsFromUser(user: User): string[] {
  return Array.isArray(user.app_metadata?.permissions)
    ? (user.app_metadata.permissions as string[])
    : [];
}
