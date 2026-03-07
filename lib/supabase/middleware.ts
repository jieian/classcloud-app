/**
 * Supabase Middleware Utilities
 * For use in Next.js middleware (Edge Runtime)
 * Next.js 16 + React 19 optimized
 */

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicEnv } from "./env";

/**
 * Creates a Supabase client for Middleware
 * Handles cookie updates in the response
 */
export async function createMiddlewareSupabaseClient(request: NextRequest) {
  // Create response that we'll update with cookies
  let response = NextResponse.next({
    request,
  });
  const { url, anonOrPublishableKey } = getSupabasePublicEnv();

  const supabase = createServerClient(
    url,
    anonOrPublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return { supabase, response };
}
