import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/*
  Service role client. Server only, used exclusively by admin server actions
  after the caller's own role has been verified through their RLS scoped
  session. Never import this from client components.
*/
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
