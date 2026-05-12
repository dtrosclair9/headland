import { createClient } from '@supabase/supabase-js'

// Server-only client using the service-role secret key. Bypasses RLS.
// Use ONLY in server actions, route handlers, or trusted server code —
// never expose this to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
