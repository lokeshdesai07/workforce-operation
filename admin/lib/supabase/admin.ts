import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Service-role client. Bypasses RLS. Only use in API routes / server actions.
// Importing this from a client component is a build error thanks to 'server-only'.
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
