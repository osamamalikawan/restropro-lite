import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Service-role Supabase client. BYPASSES ROW LEVEL SECURITY — server-only, never import
 *  this into a "use client" file or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 *  Every function that uses this client is responsible for its own tenant/authorization
 *  check (see lib/auth/staff-session.ts for the PIN-session verification helper). */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
