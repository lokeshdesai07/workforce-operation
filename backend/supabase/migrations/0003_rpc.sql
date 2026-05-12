-- 0003_rpc.sql
-- The two RPCs the mobile sync engine speaks to:
--
--   apply_op(op_id, entity, op_type, payload, base_version)
--     Idempotent server-authoritative apply. Returns:
--       { result: 'applied' | 'duplicate' | 'conflict', row, server_version }
--
--   changes_since(cursor)
--     Cursor-based pull. Returns rows updated after the cursor for
--     entities visible to the caller (RLS does the filtering).

-- ============================================================
-- apply_op
-- ============================================================

create or replace function public.apply_op(
  p_op_id        uuid,
  p_entity       text,
  p_op_type      text,        -- 'insert' | 'update' | 'delete'
  p_payload      jsonb,
  p_base_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id   uuid := auth.uid();
  v_existing    jsonb;
  v_current     jsonb;
  v_current_ver integer;
  v_entity_id   uuid;
  v_result      jsonb;
begin
  if v_worker_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_entity not in
     ('inspections', 'check_ins', 'check_outs', 'inspection_reports') then
    raise exception 'unknown entity: %', p_entity using errcode = '22023';
  end if;

  if p_op_type not in ('insert', 'update', 'delete') then
    raise exception 'unknown op_type: %', p_op_type using errcode = '22023';
  end if;

  v_entity_id := (p_payload->>'id')::uuid;
  if v_entity_id is null then
    raise exception 'payload.id is required' using errcode = '22023';
  end if;

  -- 1. Idempotency check
  select result into v_existing
    from public.idempotency_keys
    where op_id = p_op_id;
  if v_existing is not null then
    return jsonb_build_object(
      'result', 'duplicate',
      'row',    v_existing,
      'server_version', (v_existing->>'version')::integer
    );
  end if;

  -- 2. Authorization: worker must own the parent inspection
  if p_entity = 'inspections' then
    if (p_payload->>'worker_id')::uuid <> v_worker_id then
      raise exception 'cannot mutate other workers inspection' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1 from public.inspections i
      where i.id = (p_payload->>'inspection_id')::uuid
        and i.worker_id = v_worker_id
    ) then
      raise exception 'inspection not assigned to caller' using errcode = '42501';
    end if;
  end if;

  -- 3. Load current row (if update / delete)
  if p_op_type in ('update', 'delete') then
    execute format(
      'select to_jsonb(t) from public.%I t where id = $1',
      p_entity
    )
    into v_current
    using v_entity_id;

    v_current_ver := coalesce((v_current->>'version')::integer, 0);

    -- 4. Conflict check: client's base_version must match server's current
    if v_current is not null and v_current_ver <> p_base_version then
      insert into public.sync_conflicts (
        op_id, worker_id, entity, entity_id,
        client_version, server_version,
        client_payload, server_snapshot
      ) values (
        p_op_id, v_worker_id, p_entity, v_entity_id,
        p_base_version, v_current_ver,
        p_payload, v_current
      );

      -- Server wins (LWW). Record idempotency as no-op so retries return same.
      insert into public.idempotency_keys
        (op_id, worker_id, entity, entity_id, result)
      values
        (p_op_id, v_worker_id, p_entity, v_entity_id, v_current);

      return jsonb_build_object(
        'result',         'conflict',
        'row',            v_current,
        'server_version', v_current_ver
      );
    end if;
  end if;

  -- 5. Apply
  if p_op_type = 'insert' then
    if p_entity = 'inspections' then
      -- Workers cannot insert inspections (admin-only). Reject.
      raise exception 'workers cannot create inspections' using errcode = '42501';
    elsif p_entity = 'check_ins' then
      insert into public.check_ins (id, inspection_id, occurred_at, lat, lng, accuracy_m)
      values (
        v_entity_id,
        (p_payload->>'inspection_id')::uuid,
        (p_payload->>'occurred_at')::timestamptz,
        (p_payload->>'lat')::double precision,
        (p_payload->>'lng')::double precision,
        nullif(p_payload->>'accuracy_m','')::real
      )
      returning to_jsonb(check_ins.*) into v_result;
    elsif p_entity = 'check_outs' then
      insert into public.check_outs (id, inspection_id, occurred_at, lat, lng, accuracy_m)
      values (
        v_entity_id,
        (p_payload->>'inspection_id')::uuid,
        (p_payload->>'occurred_at')::timestamptz,
        (p_payload->>'lat')::double precision,
        (p_payload->>'lng')::double precision,
        nullif(p_payload->>'accuracy_m','')::real
      )
      returning to_jsonb(check_outs.*) into v_result;
    elsif p_entity = 'inspection_reports' then
      insert into public.inspection_reports (id, inspection_id, notes, status)
      values (
        v_entity_id,
        (p_payload->>'inspection_id')::uuid,
        p_payload->>'notes',
        coalesce(p_payload->>'status', 'draft')
      )
      returning to_jsonb(inspection_reports.*) into v_result;
    end if;

  elsif p_op_type = 'update' then
    if p_entity = 'inspections' then
      -- Worker may update status only; reject anything else.
      update public.inspections
        set status = coalesce(p_payload->>'status', status)
        where id = v_entity_id and worker_id = v_worker_id
        returning to_jsonb(inspections.*) into v_result;
    elsif p_entity = 'check_ins' then
      update public.check_ins
        set occurred_at = coalesce((p_payload->>'occurred_at')::timestamptz, occurred_at),
            lat         = coalesce((p_payload->>'lat')::double precision, lat),
            lng         = coalesce((p_payload->>'lng')::double precision, lng),
            accuracy_m  = coalesce(nullif(p_payload->>'accuracy_m','')::real, accuracy_m)
        where id = v_entity_id
        returning to_jsonb(check_ins.*) into v_result;
    elsif p_entity = 'check_outs' then
      update public.check_outs
        set occurred_at = coalesce((p_payload->>'occurred_at')::timestamptz, occurred_at),
            lat         = coalesce((p_payload->>'lat')::double precision, lat),
            lng         = coalesce((p_payload->>'lng')::double precision, lng),
            accuracy_m  = coalesce(nullif(p_payload->>'accuracy_m','')::real, accuracy_m)
        where id = v_entity_id
        returning to_jsonb(check_outs.*) into v_result;
    elsif p_entity = 'inspection_reports' then
      update public.inspection_reports
        set notes  = coalesce(p_payload->>'notes', notes),
            status = coalesce(p_payload->>'status', status)
        where id = v_entity_id
        returning to_jsonb(inspection_reports.*) into v_result;
    end if;

  elsif p_op_type = 'delete' then
    if p_entity = 'inspections' then
      update public.inspections set deleted_at = now()
        where id = v_entity_id and worker_id = v_worker_id
        returning to_jsonb(inspections.*) into v_result;
    else
      execute format('delete from public.%I where id = $1 returning to_jsonb(%I.*)', p_entity, p_entity)
        into v_result
        using v_entity_id;
    end if;
  end if;

  if v_result is null then
    raise exception 'apply produced no row (entity %, id %)', p_entity, v_entity_id
      using errcode = 'P0002';
  end if;

  -- 6. Idempotency record
  insert into public.idempotency_keys
    (op_id, worker_id, entity, entity_id, result)
  values
    (p_op_id, v_worker_id, p_entity, v_entity_id, v_result);

  return jsonb_build_object(
    'result',         'applied',
    'row',            v_result,
    'server_version', (v_result->>'version')::integer
  );
end;
$$;

grant execute on function public.apply_op(uuid, text, text, jsonb, integer)
  to authenticated;

-- ============================================================
-- changes_since
-- ============================================================
-- Returns rows updated after the cursor across the four domain entities.
-- RLS enforces visibility (worker sees own; admin sees all).

create or replace function public.changes_since(
  p_cursor timestamptz
)
returns table (
  entity     text,
  row_data   jsonb,
  updated_at timestamptz
)
language sql
security invoker
stable
set search_path = public
as $$
  select 'inspections'::text, to_jsonb(i.*), i.updated_at
    from public.inspections i where i.updated_at > p_cursor
  union all
  select 'check_ins'::text, to_jsonb(c.*), c.updated_at
    from public.check_ins c where c.updated_at > p_cursor
  union all
  select 'check_outs'::text, to_jsonb(c.*), c.updated_at
    from public.check_outs c where c.updated_at > p_cursor
  union all
  select 'inspection_reports'::text, to_jsonb(r.*), r.updated_at
    from public.inspection_reports r where r.updated_at > p_cursor
  order by 3 asc;
$$;

grant execute on function public.changes_since(timestamptz) to authenticated;
