"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser-side Supabase client — used ONLY for the owner's own Supabase-Auth session
 *  (signup, owner login, reading their own `restaurants` row). Staff PIN sessions never
 *  use this: that traffic goes through Next.js server routes instead (see ARCHITECTURE.md). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
