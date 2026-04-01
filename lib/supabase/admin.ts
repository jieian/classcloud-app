import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client — uses the service role key to bypass RLS.
 *
 * Module-level singleton: created once per serverless instance and reused
 * across all requests within that instance. This avoids the overhead of
 * re-establishing a client on every request.
 *
 * NEVER expose this client or its key to the browser.
 */
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
