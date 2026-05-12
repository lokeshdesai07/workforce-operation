# backend

Supabase project for the workforce operations sync demo.

## Layout

```
backend/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_init.sql       # tables + indexes + triggers + realtime
│   │   ├── 0002_rls.sql        # row-level security
│   │   └── 0003_rpc.sql        # apply_op + changes_since
│   └── seed.sql                # admin + demo worker
└── types.ts                    # shared TS types (imported by mobile/ + admin/)
```

## Run locally

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
cd backend
supabase start            # boots Postgres + Auth + Realtime + Studio
supabase db reset         # runs migrations + seed.sql
```

After `supabase start`, note the values printed:

- `API URL`           → put into both `mobile/.env` and `admin/.env.local`
- `anon key`          → both
- `service_role key`  → **admin/.env.local only** (never ship to mobile)

## Demo credentials (seeded)

| Role   | Email                | Password    |
|--------|----------------------|-------------|
| Admin  | admin@example.com    | admin1234   |
| Worker | worker@example.com   | worker1234  |

The admin account can sign in to `admin/`. The worker account can sign in
to `mobile/`. The admin will use the create-worker form to issue more
worker accounts during the demo.

## Notes

- `apply_op` is `security definer` so it can write to `idempotency_keys`
  and `sync_conflicts` regardless of the caller's RLS visibility on those
  tables. Authorization is enforced inside the function.
- `changes_since` is `security invoker` so RLS does the visibility
  filtering — workers see their own rows, admins see all.
- Triggers bump `version` and `updated_at` on every UPDATE. The RPC reads
  the resulting row with `to_jsonb(...)` so the client always gets the
  authoritative version back.
- All four domain tables are added to the `supabase_realtime` publication
  so the admin live panels receive change events.
