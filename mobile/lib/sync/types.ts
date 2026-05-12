import type { SyncEntity, OpType } from '@shared/types';
export type { SyncEntity, OpType };

export interface OutboxRow {
  op_id: string;
  entity: SyncEntity;
  entity_id: string;
  op_type: OpType;
  payload: string;            // JSON-encoded
  base_version: number;
  attempts: number;
  next_attempt_at: number;    // epoch ms
  last_error: string | null;
  state: 'pending' | 'in_flight' | 'dead';
  created_at: number;
}

export interface SyncStats {
  pending: number;
  inFlight: number;
  dead: number;
  conflicts: number;
}
