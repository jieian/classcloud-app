/**
 * Next.js Proxy (formerly Middleware)
 * Handles authentication and session refresh
 * Migrated to @supabase/ssr for Next.js 16 compatibility
 */

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  // The response variable MUST live in the same scope as setAll so that
  // when setAll reassigns it during a token refresh, the return statement
  // below sees the updated response (with fresh auth cookies).
  // Previously this was extracted into a helper, but destructuring broke
  // the reference — the caller kept the stale response without new cookies.
  let response = NextResponse.next({ request });

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
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the JWT AND refreshes expired tokens.
  // The refresh triggers setAll above, updating `response` with new cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const nextPath = request.nextUrl.pathname + request.nextUrl.search;
  const isLogoutFlow = pathname === "/login" && request.nextUrl.searchParams.get("logout") === "1";
  const requestedNext = request.nextUrl.searchParams.get("next");
  const safeNext =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

  // Pages anyone can access (unauthenticated or authenticated)
  const alwaysPublicPaths = ["/reset-password", "/auth/callback", "/signup/confirmed", "/invite/activate"];
  // Pages only unauthenticated users should see (authenticated users get redirected away)
  const unauthOnlyPaths = ["/login", "/forgot-password", "/signup"];
  const publicPaths = [...alwaysPublicPaths, ...unauthOnlyPaths];

  if (!user && !publicPaths.includes(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to home if already authenticated and trying to access unauthenticated-only pages
  if (user && unauthOnlyPaths.includes(pathname) && !isLogoutFlow) {
    const homeUrl = new URL(safeNext, request.url);
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
