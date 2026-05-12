import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase/server';
import { createSupabaseAdminClient } from './supabase/admin';

export async function requireAdmin() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!row) redirect('/login?error=not_admin');
  return user;
}
