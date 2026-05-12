import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const sb = createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { user: null, admin: null, status: 401 as const };

  const admin = createSupabaseAdminClient();
  const { data: adminRow } = await admin
    .from('admins').select('id').eq('id', user.id).maybeSingle();
  if (!adminRow) return { user, admin: null, status: 403 as const };
  return { user, admin, status: 200 as const };
}

export async function POST(request: Request) {
  const { admin, status } = await requireAdmin();
  if (!admin) return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'forbidden' }, { status });

  const body = await request.json().catch(() => null) as
    | { worker_id?: string; title?: string; site_address?: string | null }
    | null;
  if (!body?.worker_id || !body?.title) {
    return NextResponse.json({ error: 'worker_id, title required' }, { status: 400 });
  }

  const id = randomUUID();
  const { data, error } = await admin
    .from('inspections')
    .insert({
      id,
      worker_id: body.worker_id,
      title: body.title,
      site_address: body.site_address ?? null,
      status: 'assigned',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ inspection: data });
}

export async function PATCH(request: Request) {
  // Reassign or rename. Worker-side status updates go through apply_op, not here.
  const { admin, status } = await requireAdmin();
  if (!admin) return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'forbidden' }, { status });

  const body = await request.json().catch(() => null) as
    | { id?: string; worker_id?: string; title?: string; site_address?: string | null }
    | null;
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.worker_id !== undefined) patch.worker_id = body.worker_id;
  if (body.title !== undefined) patch.title = body.title;
  if (body.site_address !== undefined) patch.site_address = body.site_address;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('inspections').update(patch).eq('id', body.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ inspection: data });
}
