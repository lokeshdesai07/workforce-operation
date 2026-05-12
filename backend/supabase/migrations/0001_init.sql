-- 0001_init.sql
-- Core domain + sync infrastructure for workforce operations.
--
-- Conventions:
--   - Every domain table has updated_at + version (monotonic int).
--   - All ids are uuid; client-generated UUID v7 lets us order without a sequence.
--   - Deletes are tombstones (deleted_at) so pull cursors don't lose them.

-- ============================================================
-- Identity
-- ============================================================

-- Profile row, 1:1 with auth.users. Created by the admin server route
-- in the same transaction as auth.users via supabase.auth.admin.createUser().
create table if not exists public.workers (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Admin-only marker. We don't need a full role system for Part 1; a single
-- boolean column on a separate table is enough to gate RLS.
create table if not exists public.admins (
  id         uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where id = uid);
$$;

-- ============================================================
-- Domain
-- ============================================================

create table if not exists public.inspections (
  id            uuid primary key,
  worker_id     uuid not null references public.workers(id),
  title         text not null,
  site_address  text,
  status        text not null default 'assigned'
                check (status in ('assigned', 'in_progress', 'done')),
  updated_at    timestamptz not null default now(),
  version       integer not null default 1,
  deleted_at    timestamptz
);

create index if not exists inspections_worker_id_idx
  on public.inspections (worker_id);
create index if not exists inspections_updated_at_idx
  on public.inspections (updated_at);

create table if not exists public.check_ins (
  id            uuid primary key,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  occurred_at   timestamptz not null,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    real,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);

create index if not exists check_ins_inspection_id_idx
  on public.check_ins (inspection_id);
create index if not exists check_ins_updated_at_idx
  on public.check_ins (updated_at);

create table if not exists public.check_outs (
  id            uuid primary key,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  occurred_at   timestamptz not null,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    real,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);

create index if not exists check_outs_inspection_id_idx
  on public.check_outs (inspection_id);
create index if not exists check_outs_updated_at_idx
  on public.check_outs (updated_at);

create table if not exists public.inspection_reports (
  id            uuid primary key,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  notes         text,
  status        text not null default 'draft'
                check (status in ('draft', 'submitted')),
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);

create index if not exists inspection_reports_inspection_id_idx
  on public.inspection_reports (inspection_id);
create index if not exists inspection_reports_updated_at_idx
  on public.inspection_reports (updated_at);

-- ============================================================
-- Sync infrastructure
-- ============================================================

-- Idempotency: server checks op_id before applying. If present, return prior
-- result. Makes "ack lost mid-flight" safe for the client to retry.
create table if not exists public.idempotency_keys (
  op_id        uuid primary key,
  worker_id    uuid not null references public.workers(id),
  entity       text not null,
  entity_id    uuid not null,
  applied_at   timestamptz not null default now(),
  result       jsonb not null     -- the canonical row that was applied
);

create index if not exists idempotency_keys_worker_id_idx
  on public.idempotency_keys (worker_id);

-- Conflict log: when client's base_version diverges from server's version,
-- server logs both snapshots and applies LWW (server wins).
create table if not exists public.sync_conflicts (
  id              bigserial primary key,
  op_id           uuid not null,
  worker_id       uuid not null references public.workers(id),
  entity          text not null,
  entity_id       uuid not null,
  client_version  integer not null,
  server_version  integer not null,
  client_payload  jsonb not null,
  server_snapshot jsonb not null,
  resolved_as     text not null default 'server_wins',
  detected_at     timestamptz not null default now()
);

create index if not exists sync_conflicts_detected_at_idx
  on public.sync_conflicts (detected_at desc);

-- ============================================================
-- updated_at + version triggers
-- ============================================================

create or replace function public.bump_version_and_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := coalesce(old.version, 0) + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inspections_bump on public.inspections;
create trigger trg_inspections_bump
  before update on public.inspections
  for each row execute function public.bump_version_and_updated_at();

drop trigger if exists trg_check_ins_bump on public.check_ins;
create trigger trg_check_ins_bump
  before update on public.check_ins
  for each row execute function public.bump_version_and_updated_at();

drop trigger if exists trg_check_outs_bump on public.check_outs;
create trigger trg_check_outs_bump
  before update on public.check_outs
  for each row execute function public.bump_version_and_updated_at();

drop trigger if exists trg_inspection_reports_bump on public.inspection_reports;
create trigger trg_inspection_reports_bump
  before update on public.inspection_reports
  for each row execute function public.bump_version_and_updated_at();

-- ============================================================
-- Realtime publication (admin live panels subscribe to these)
-- ============================================================

alter publication supabase_realtime add table public.inspections;
alter publication supabase_realtime add table public.check_ins;
alter publication supabase_realtime add table public.check_outs;
alter publication supabase_realtime add table public.inspection_reports;
alter publication supabase_realtime add table public.sync_conflicts;
alter publication supabase_realtime add table public.idempotency_keys;
alter publication supabase_realtime add table public.workers;
