/**
 * Supabase Server Utilities
 * For use in Server Components, Server Actions, and Route Handlers
 * Next.js 16 + React 19 optimized
 */

import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";

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

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * The minimal authenticated-user shape the app actually consumes: an id, an
 * optional email, and app_metadata (where permissions live). Returned by both
 * getAuthUser() and getServerUser().
 */
export type AuthUser = {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

/**
 * Resolves the authenticated user for a given server client.
 *
 * Fast path: getClaims() verifies the JWT LOCALLY against the cached JWKS — no
 * Auth-server round-trip — when the project uses asymmetric JWT signing keys.
 * (With a legacy HS256 secret, getClaims() transparently calls the Auth server,
 * same cost as getUser(), so this is always safe to ship.)
 *
 * Fallback: if claims are missing/expired/unverifiable, call getUser(), which
 * validates AND refreshes the session. This keeps behaviour identical to the
 * old getUser()-only path in every edge case.
 *
 * NOTE: on the getClaims() fast path, app_metadata (permissions) is read from
 * the JWT, so it reflects permissions as of the last token refresh — consistent
 * with the app's permission-sync model (usePermissionsSync forces a refresh when
 * permissions change).
 */
export async function getAuthUser(
  supabase: SupabaseServerClient,
): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as
    | {
        sub?: string;
        email?: string;
        app_metadata?: Record<string, unknown>;
        user_metadata?: Record<string, unknown>;
      }
    | undefined;

  if (!error && claims?.sub) {
    return {
      id: claims.sub,
      email: claims.email ?? null,
      app_metadata: claims.app_metadata ?? {},
      user_metadata: claims.user_metadata ?? {},
    };
  }

  // Fallback: validates AND refreshes the session against the Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    app_metadata: (user.app_metadata as Record<string, unknown>) ?? {},
    user_metadata: (user.user_metadata as Record<string, unknown>) ?? {},
  };
}

/**
 * Gets the current authenticated user from server-side.
 * Wrapped with React cache() so multiple server components or route handlers
 * calling this within the same request share one resolution instead of N.
 * cache() resets per request, so there is no cross-request data leakage.
 */
export const getServerUser = cache(async function getServerUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabaseClient();
  return getAuthUser(supabase);
});

/**
 * Reads the user's permissions from their app_metadata (populated by
 * syncUserPermissions whenever roles change). Zero DB round-trip.
 *
 * Accepts any object carrying app_metadata, so it works with both the new
 * AuthUser and a full supabase-js User (during/after the getClaims migration).
 */
export function getPermissionsFromUser(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined,
): string[] {
  const perms = user?.app_metadata?.permissions;
  return Array.isArray(perms) ? (perms as string[]) : [];
}
