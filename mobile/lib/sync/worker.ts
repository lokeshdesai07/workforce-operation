// Sync worker: drains the outbox one op at a time.
//
// Triggers: NetInfo connection events, AppState foreground, an enqueue,
// and a low-frequency heartbeat for retries that fall due while idle.

import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { getDb } from '@/lib/db';
import { supabase } from '@/lib/supabase/client';
import { applyToLocal } from './mutations';
import { MAX_ATTEMPTS, nextDelayMs } from './backoff';
import type { ApplyOpResponse } from '@shared/types';
import type { OutboxRow } from './types';

let _draining = false;
let _kickPending = false;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _online = true;
const _listeners = new Set<() => void>();

export function subscribeSyncState(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
function notify() {
  for (const fn of _listeners) fn();
}

export function kickSyncWorker(): void {
  if (_draining) {
    _kickPending = true;
    return;
  }
  void drain();
}

export function startSyncWorker(): () => void {
  // 1. Connectivity
  const netSub = NetInfo.addEventListener((state) => {
    _online = !!state.isConnected && state.isInternetReachable !== false;
    if (_online) kickSyncWorker();
    notify();
  });
  // 2. Foreground
  const appSub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') kickSyncWorker();
  });
  // 3. Heartbeat — checks every 5s for pending ops whose backoff has expired.
  _heartbeatTimer = setInterval(() => {
    if (_online) kickSyncWorker();
  }, 5_000);

  // Initial drain.
  kickSyncWorker();

  return () => {
    netSub();
    appSub.remove();
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  };
}

async function drain(): Promise<void> {
  if (_draining) return;
  _draining = true;
  try {
    while (true) {
      if (!_online) break;
      const op = await pickNextOp();
      if (!op) break;
      await processOp(op);
      notify();
    }
  } finally {
    _draining = false;
    if (_kickPending) {
      _kickPending = false;
      void drain();
    }
  }
}

async function pickNextOp(): Promise<OutboxRow | null> {
  const db = await getDb();
  const now = Date.now();
  const row = await db.getFirstAsync<OutboxRow>(
    `SELECT * FROM outbox
       WHERE state = 'pending' AND next_attempt_at <= ?
       ORDER BY op_id ASC
       LIMIT 1`,
    [now],
  );
  if (!row) return null;
  // Mark in_flight so concurrent calls won't pick it up.
  await db.runAsync(
    `UPDATE outbox SET state = 'in_flight' WHERE op_id = ?`,
    [row.op_id],
  );
  return { ...row, state: 'in_flight' };
}

async function processOp(op: OutboxRow): Promise<void> {
  const db = await getDb();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(op.payload);
  } catch {
    await markDead(op.op_id, 'malformed payload');
    return;
  }

  const { data, error } = await supabase.rpc('apply_op', {
    p_op_id: op.op_id,
    p_entity: op.entity,
    p_op_type: op.op_type,
    p_payload: payload,
    p_base_version: op.base_version,
  });

  if (error) {
    // Postgres errcode 42501 = insufficient_privilege; treat as permanent.
    const code = (error as { code?: string }).code;
    const isPermanent =
      code === '42501' || code === '22023' || code === 'P0002';
    if (isPermanent) {
      await markDead(op.op_id, error.message);
      return;
    }
    await scheduleRetry(op, error.message);
    return;
  }

  const resp = data as ApplyOpResponse;
  if (!resp || !resp.result) {
    await scheduleRetry(op, 'empty response');
    return;
  }

  // Apply server's canonical row to local mirror so versions line up.
  await applyToLocal(op.entity, 'update', resp.row);

  if (resp.result === 'conflict') {
    await db.runAsync(
      `INSERT INTO local_conflicts
        (op_id, entity, entity_id, client_version, server_version, detected_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        op.op_id,
        op.entity,
        op.entity_id,
        op.base_version,
        resp.server_version,
        Date.now(),
      ],
    );
  }

  await db.runAsync(`DELETE FROM outbox WHERE op_id = ?`, [op.op_id]);
}

async function scheduleRetry(op: OutboxRow, error: string): Promise<void> {
  const db = await getDb();
  const attempts = op.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await markDead(op.op_id, error);
    return;
  }
  const delay = nextDelayMs(attempts);
  await db.runAsync(
    `UPDATE outbox
       SET state = 'pending',
           attempts = ?,
           next_attempt_at = ?,
           last_error = ?
     WHERE op_id = ?`,
    [attempts, Date.now() + delay, error.slice(0, 500), op.op_id],
  );
}

async function markDead(opId: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET state = 'dead', last_error = ? WHERE op_id = ?`,
    [error.slice(0, 500), opId],
  );
}

export async function retryDead(opId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox
       SET state = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL
     WHERE op_id = ? AND state = 'dead'`,
    [Date.now(), opId],
  );
  kickSyncWorker();
}

export async function discardDead(opId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM outbox WHERE op_id = ? AND state = 'dead'`,
    [opId],
  );
  notify();
}

export function isOnline(): boolean {
  return _online;
}
