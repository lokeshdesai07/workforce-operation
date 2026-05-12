// The mutation API. Every write goes through enqueueMutation, which
// performs the domain-table write AND the outbox insert in one SQLite
// transaction. If the app is killed mid-call, both land or neither does.

import { getDb } from '@/lib/db';
import { uuidv7 } from './uuid';
import type { OpType, SyncEntity } from './types';
import { kickSyncWorker } from './worker';

export interface EnqueueArgs<T extends Record<string, unknown>> {
  entity: SyncEntity;
  opType: OpType;
  payload: T;
  baseVersion: number;
}

export async function enqueueMutation<T extends Record<string, unknown>>(
  args: EnqueueArgs<T>,
): Promise<{ opId: string }> {
  const opId = uuidv7();
  const now = Date.now();
  const id = String(args.payload.id);
  if (!id) throw new Error('payload.id is required');

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // 1. Apply optimistically to local domain table so UI updates immediately.
    await applyToLocal(args.entity, args.opType, args.payload);

    // 2. Append outbox entry.
    await db.runAsync(
      `INSERT INTO outbox
        (op_id, entity, entity_id, op_type, payload,
         base_version, next_attempt_at, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        opId,
        args.entity,
        id,
        args.opType,
        JSON.stringify(args.payload),
        args.baseVersion,
        now,
        now,
      ],
    );
  });

  // Wake the worker outside the transaction.
  kickSyncWorker();
  return { opId };
}

// Local-side mirror of apply_op's effects. Used by mutations + by pull.
export async function applyToLocal<T extends Record<string, unknown>>(
  entity: SyncEntity,
  opType: OpType,
  payload: T,
): Promise<void> {
  const db = await getDb();
  const id = String(payload.id);

  if (opType === 'delete') {
    if (entity === 'inspections') {
      await db.runAsync(
        `UPDATE inspections SET deleted_at = ?, updated_at = ?
         WHERE id = ?`,
        [new Date().toISOString(), new Date().toISOString(), id],
      );
    } else {
      await db.runAsync(`DELETE FROM ${entity} WHERE id = ?`, [id]);
    }
    return;
  }

  // insert / update — upsert into local mirror.
  switch (entity) {
    case 'inspections':
      await db.runAsync(
        `INSERT INTO inspections
          (id, worker_id, title, site_address, status, updated_at, version, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            worker_id   = excluded.worker_id,
            title       = excluded.title,
            site_address= excluded.site_address,
            status      = excluded.status,
            updated_at  = excluded.updated_at,
            version     = excluded.version,
            deleted_at  = excluded.deleted_at`,
        [
          id,
          String(payload.worker_id ?? ''),
          String(payload.title ?? ''),
          (payload.site_address as string | null) ?? null,
          String(payload.status ?? 'assigned'),
          (payload.updated_at as string | null) ?? new Date().toISOString(),
          Number(payload.version ?? 1),
          (payload.deleted_at as string | null) ?? null,
        ],
      );
      break;

    case 'check_ins':
    case 'check_outs':
      await db.runAsync(
        `INSERT INTO ${entity}
          (id, inspection_id, occurred_at, lat, lng, accuracy_m, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            inspection_id = excluded.inspection_id,
            occurred_at   = excluded.occurred_at,
            lat           = excluded.lat,
            lng           = excluded.lng,
            accuracy_m    = excluded.accuracy_m,
            updated_at    = excluded.updated_at,
            version       = excluded.version`,
        [
          id,
          String(payload.inspection_id ?? ''),
          String(payload.occurred_at ?? new Date().toISOString()),
          Number(payload.lat ?? 0),
          Number(payload.lng ?? 0),
          payload.accuracy_m == null ? null : Number(payload.accuracy_m),
          (payload.updated_at as string | null) ?? new Date().toISOString(),
          Number(payload.version ?? 1),
        ],
      );
      break;

    case 'inspection_reports':
      await db.runAsync(
        `INSERT INTO inspection_reports
          (id, inspection_id, notes, status, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            inspection_id = excluded.inspection_id,
            notes         = excluded.notes,
            status        = excluded.status,
            updated_at    = excluded.updated_at,
            version       = excluded.version`,
        [
          id,
          String(payload.inspection_id ?? ''),
          (payload.notes as string | null) ?? null,
          String(payload.status ?? 'draft'),
          (payload.updated_at as string | null) ?? new Date().toISOString(),
          Number(payload.version ?? 1),
        ],
      );
      break;
  }
}
