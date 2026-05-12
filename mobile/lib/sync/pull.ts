// Pull side of the sync engine.
//
// Two channels feeding the same applyToLocal:
//   1. Cursor pull on app start / pull-to-refresh.
//   2. Realtime subscription while the app is foregrounded.

import { supabase } from '@/lib/supabase/client';
import { getMeta, setMeta } from '@/lib/db';
import { applyToLocal } from './mutations';
import type { ChangesSinceRow, SyncEntity } from '@shared/types';

const CURSOR_KEY = 'last_pull_cursor';
const EPOCH_ZERO = '1970-01-01T00:00:00Z';

export async function pullChanges(): Promise<{ count: number }> {
  const cursor = (await getMeta(CURSOR_KEY)) ?? EPOCH_ZERO;
  const { data, error } = await supabase.rpc('changes_since', {
    p_cursor: cursor,
  });
  if (error) throw error;
  const rows = (data ?? []) as ChangesSinceRow[];
  let latest = cursor;
  for (const r of rows) {
    await applyToLocal(r.entity, 'update', r.row_data as Record<string, unknown>);
    if (r.updated_at > latest) latest = r.updated_at;
  }
  if (latest !== cursor) await setMeta(CURSOR_KEY, latest);
  return { count: rows.length };
}

const ENTITIES: SyncEntity[] = [
  'inspections',
  'check_ins',
  'check_outs',
  'inspection_reports',
];

export function startRealtime(): () => void {
  const channel = supabase.channel('domain-changes');
  for (const entity of ENTITIES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: entity },
      async (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown>;
        if (!row?.id) return;
        if (payload.eventType === 'DELETE') {
          await applyToLocal(entity, 'delete', row);
        } else {
          await applyToLocal(entity, 'update', row);
        }
        // Advance cursor opportunistically.
        const ts = (row.updated_at as string | undefined) ?? null;
        if (ts) {
          const cursor = (await getMeta(CURSOR_KEY)) ?? EPOCH_ZERO;
          if (ts > cursor) await setMeta(CURSOR_KEY, ts);
        }
      },
    );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
