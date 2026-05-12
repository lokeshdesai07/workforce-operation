-- 0002_rls.sql
-- Row-level security.
--
-- Roles:
--   - admin:  full read across all tables; writes only via service-role
--             from Next.js server (bypasses RLS by design).
--   - worker: reads own profile, own inspections + child rows; writes
--             check_ins / check_outs / inspection_reports for own inspections;
--             may update inspections.status only (column-level enforced via
--             apply_op RPC, not via RLS column policies).

alter table public.workers              enable row level security;
alter table public.admins               enable row level security;
alter table public.inspections          enable row level security;
alter table public.check_ins            enable row level security;
alter table public.check_outs           enable row level security;
alter table public.inspection_reports   enable row level security;
alter table public.idempotency_keys     enable row level security;
alter table public.sync_conflicts       enable row level security;

-- ============================================================
-- workers
-- ============================================================
create policy workers_self_select
  on public.workers for select
  using (id = auth.uid() or public.is_admin(auth.uid()));

-- ============================================================
-- admins (only admins can see admin list)
-- ============================================================
create policy admins_self_select
  on public.admins for select
  using (id = auth.uid() or public.is_admin(auth.uid()));

-- ============================================================
-- inspections
-- ============================================================
create policy inspections_select
  on public.inspections for select
  using (
    worker_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- Worker may only update own row. apply_op RPC further restricts which
-- columns may change (status only). Admins write via service-role and
-- bypass RLS.
create policy inspections_update_self
  on public.inspections for update
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid());

-- ============================================================
-- check_ins / check_outs / inspection_reports
-- (worker can read & write own; admin can read all)
-- ============================================================
create policy check_ins_select
  on public.check_ins for select
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.inspections i
      where i.id = check_ins.inspection_id and i.worker_id = auth.uid()
    )
  );

create policy check_ins_insert
  on public.check_ins for insert
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = check_ins.inspection_id and i.worker_id = auth.uid()
    )
  );

create policy check_ins_update
  on public.check_ins for update
  using (
    exists (
      select 1 from public.inspections i
      where i.id = check_ins.inspection_id and i.worker_id = auth.uid()
    )
  );

create policy check_outs_select
  on public.check_outs for select
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.inspections i
      where i.id = check_outs.inspection_id and i.worker_id = auth.uid()
    )
  );

create policy check_outs_insert
  on public.check_outs for insert
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = check_outs.inspection_id and i.worker_id = auth.uid()
    )
  );

create policy check_outs_update
  on public.check_outs for update
  using (
    exists (
      select 1 from public.inspections i
      where i.id = check_outs.inspection_id and i.worker_id = auth.uid()
    )
  );

create policy inspection_reports_select
  on public.inspection_reports for select
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.inspections i
      where i.id = inspection_reports.inspection_id and i.worker_id = auth.uid()
    )
  );

create policy inspection_reports_insert
  on public.inspection_reports for insert
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_reports.inspection_id and i.worker_id = auth.uid()
    )
  );

create policy inspection_reports_update
  on public.inspection_reports for update
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_reports.inspection_id and i.worker_id = auth.uid()
    )
  );

-- ============================================================
-- idempotency_keys + sync_conflicts (read-only to authenticated, written by RPC)
-- ============================================================
create policy idempotency_keys_select
  on public.idempotency_keys for select
  using (worker_id = auth.uid() or public.is_admin(auth.uid()));

create policy sync_conflicts_select
  on public.sync_conflicts for select
  using (worker_id = auth.uid() or public.is_admin(auth.uid()));
