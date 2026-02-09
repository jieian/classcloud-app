/**
 * Next.js Proxy (formerly Middleware) - Edge Runtime
 * Handles authentication and routing logic
 * Migrated to @supabase/ssr for Next.js 16 compatibility
 * Note: Next.js 16 renamed "middleware" to "proxy"
 */

import { type NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";
import { NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { supabase, response } = await createMiddlewareSupabaseClient(request);

  // Refresh session if it exists
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  // Redirect to login if not authenticated (except for login page)
  if (!session && pathname !== "/login") {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to home if already authenticated and trying to access login
  if (session && pathname === "/login") {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes
     * - logo directory
     */
    "/((?!_next/static|_next/image|favicon.ico|api|logo).*)",
  ],
};
