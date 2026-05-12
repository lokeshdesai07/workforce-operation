import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  // 1. Confirm caller is signed in.
  const sb = createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // 2. Confirm caller is an admin (via service-role lookup, RLS-bypassing).
  const admin = createSupabaseAdminClient();
  const { data: adminRow } = await admin
    .from('admins').select('id').eq('id', user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // 3. Validate input.
  const body = await request.json().catch(() => null) as
    | { email?: string; password?: string; full_name?: string; phone?: string | null }
    | null;
  if (!body?.email || !body?.password || !body?.full_name) {
    return NextResponse.json({ error: 'email, password, full_name required' }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'password must be >= 8 chars' }, { status: 400 });
  }

  // 4. Create auth user (service-role).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? 'create failed' }, { status: 400 });
  }

  // 5. Insert profile row. If this fails, roll back the auth user so we don't
  //    leave an orphan account that can sign in but has no profile.
  const { error: profileErr } = await admin.from('workers').insert({
    id: created.user.id,
    full_name: body.full_name,
    phone: body.phone ?? null,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ id: created.user.id });
}

export async function GET() {
  // Convenience: list workers for the admin UI. Service-role, RLS-bypassing.
  const sb = createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: adminRow } = await admin
    .from('admins').select('id').eq('id', user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data, error } = await admin
    .from('workers')
    .select('id, full_name, phone, active, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workers: data });
}
