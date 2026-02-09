/**
 * Supabase Server Utilities
 * For use in Server Components, Server Actions, and Route Handlers
 * Next.js 16 + React 19 optimized
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client for Server Components
 * Automatically handles cookie-based session management
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
 * Gets the current authenticated user from server-side
 * Returns null if not authenticated
 */
export async function getServerUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Gets user permissions from server-side
 * Uses RPC function to fetch permissions efficiently
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_user_permissions", {
    user_uuid: userId,
  });

  if (error) {
    console.error("Error fetching permissions:", error);
    return [];
  }

  return data?.map((p: any) => p.permission_name) || [];
}
