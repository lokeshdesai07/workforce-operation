// Read helpers used by the UI. Always read from SQLite (source of truth).

import { getDb } from '@/lib/db';
import type {
  Inspection,
  CheckIn,
  CheckOut,
  InspectionReport,
} from '@shared/types';
import type { OutboxRow, SyncStats } from './types';

export async function listInspections(workerId: string): Promise<Inspection[]> {
  const db = await getDb();
  return db.getAllAsync<Inspection>(
    `SELECT * FROM inspections
       WHERE worker_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
    [workerId],
  );
}

export async function getInspection(id: string): Promise<Inspection | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Inspection>(
    `SELECT * FROM inspections WHERE id = ?`,
    [id],
  );
  return row ?? null;
}

export async function getCheckIn(inspectionId: string): Promise<CheckIn | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<CheckIn>(
      `SELECT * FROM check_ins WHERE inspection_id = ? ORDER BY occurred_at DESC LIMIT 1`,
      [inspectionId],
    )) ?? null
  );
}

export async function getCheckOut(inspectionId: string): Promise<CheckOut | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<CheckOut>(
      `SELECT * FROM check_outs WHERE inspection_id = ? ORDER BY occurred_at DESC LIMIT 1`,
      [inspectionId],
    )) ?? null
  );
}

export async function getReport(inspectionId: string): Promise<InspectionReport | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<InspectionReport>(
      `SELECT * FROM inspection_reports WHERE inspection_id = ? LIMIT 1`,
      [inspectionId],
    )) ?? null
  );
}

export async function listOutbox(): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox ORDER BY op_id ASC`,
  );
}

export async function syncStats(): Promise<SyncStats> {
  const db = await getDb();
  const counts = await db.getAllAsync<{ state: string; n: number }>(
    `SELECT state, COUNT(*) as n FROM outbox GROUP BY state`,
  );
  let pending = 0, inFlight = 0, dead = 0;
  for (const c of counts) {
    if (c.state === 'pending') pending = c.n;
    else if (c.state === 'in_flight') inFlight = c.n;
    else if (c.state === 'dead') dead = c.n;
  }
  const conflictRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM local_conflicts`,
  );
  return {
    pending,
    inFlight,
    dead,
    conflicts: conflictRow?.n ?? 0,
  };
}

export interface LocalConflict {
  id: number;
  op_id: string;
  entity: string;
  entity_id: string;
  client_version: number;
  server_version: number;
  detected_at: number;
}

export async function listConflicts(): Promise<LocalConflict[]> {
  const db = await getDb();
  return db.getAllAsync<LocalConflict>(
    `SELECT * FROM local_conflicts ORDER BY detected_at DESC LIMIT 50`,
  );
}
