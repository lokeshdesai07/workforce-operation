// backend/types.ts
// Shared types between mobile/ and admin/.
// Hand-written so neither side needs the Supabase CLI to generate.

export type SyncEntity =
  | 'inspections'
  | 'check_ins'
  | 'check_outs'
  | 'inspection_reports';

export type OpType = 'insert' | 'update' | 'delete';

// ============================================================
// Domain rows (server canonical shape)
// ============================================================

export interface Worker {
  id: string;
  full_name: string;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export type InspectionStatus = 'assigned' | 'in_progress' | 'done';

export interface Inspection {
  id: string;
  worker_id: string;
  title: string;
  site_address: string | null;
  status: InspectionStatus;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

export interface CheckIn {
  id: string;
  inspection_id: string;
  occurred_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  updated_at: string;
  version: number;
}

export interface CheckOut {
  id: string;
  inspection_id: string;
  occurred_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  updated_at: string;
  version: number;
}

export type InspectionReportStatus = 'draft' | 'submitted';

export interface InspectionReport {
  id: string;
  inspection_id: string;
  notes: string | null;
  status: InspectionReportStatus;
  updated_at: string;
  version: number;
}

export interface SyncConflict {
  id: number;
  op_id: string;
  worker_id: string;
  entity: SyncEntity;
  entity_id: string;
  client_version: number;
  server_version: number;
  client_payload: Record<string, unknown>;
  server_snapshot: Record<string, unknown>;
  resolved_as: 'server_wins';
  detected_at: string;
}

export interface IdempotencyKey {
  op_id: string;
  worker_id: string;
  entity: SyncEntity;
  entity_id: string;
  applied_at: string;
  result: Record<string, unknown>;
}

// ============================================================
// apply_op RPC contract
// ============================================================

export interface ApplyOpRequest {
  p_op_id: string;          // UUID v7
  p_entity: SyncEntity;
  p_op_type: OpType;
  p_payload: Record<string, unknown>;
  p_base_version: number;
}

export type ApplyOpResult = 'applied' | 'duplicate' | 'conflict';

export interface ApplyOpResponse {
  result: ApplyOpResult;
  row: Record<string, unknown>;
  server_version: number;
}

// ============================================================
// changes_since RPC contract
// ============================================================

export interface ChangesSinceRow {
  entity: SyncEntity;
  row_data: Record<string, unknown>;
  updated_at: string;
}
