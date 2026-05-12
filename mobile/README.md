# mobile

Expo (React Native) app for field workers. Source of truth for all
worker-side data is local SQLite; sync is eventual.

## Layout

```
mobile/
├── app/                      # expo-router pages
│   ├── _layout.tsx           # boots SQLite + sync worker + realtime
│   ├── index.tsx             # redirect (login / inspections)
│   ├── login.tsx
│   ├── inspections/
│   │   ├── index.tsx         # list (offline-capable)
│   │   └── [id].tsx          # detail (check-in, report, check-out)
│   └── sync-inspector.tsx    # the proof screen
├── lib/
│   ├── db/                   # SQLite schema + open/reset helpers
│   ├── sync/                 # outbox, worker, pull, queries, uuid
│   └── supabase/             # auth-aware client
├── hooks/                    # useSyncStats, useDbQuery
└── app.json / package.json / tsconfig.json
```

## Run

```bash
cd mobile
cp .env.example .env          # paste anon key from `supabase start`
npm install
npx expo start                # then 'i' for iOS sim or 'a' for Android
```

Sign in with `worker@example.com / worker1234` (seeded). The admin can
issue more accounts from the admin console.

## How sync actually flows

1. Each user action calls `enqueueMutation` (`lib/sync/mutations.ts`).
   It opens a SQLite transaction that:
   - upserts the row into the local domain table (UI updates immediately),
   - inserts a row in `outbox` with op_id (UUID v7) and base_version.
2. The sync worker (`lib/sync/worker.ts`) drains the outbox one op at a
   time. It calls the `apply_op` RPC on the server, which:
   - returns `applied` (writes idempotency_keys + canonical row),
   - or `duplicate` (op_id already applied → no-op),
   - or `conflict` (server's version moved past client's; logs in
     `sync_conflicts`, server wins, returns canonical row).
3. The worker writes the canonical row back to SQLite, deletes the
   outbox entry, and emits a state change so any watching screen
   re-reads.
4. Pull (`lib/sync/pull.ts`) runs on app start (cursor-based) and live
   while foregrounded (Realtime subscription). Both feed `applyToLocal`,
   so the rest of the app is oblivious to which channel delivered the
   row.

## Failure modes (recordable demo)

- **Airplane mode → make 5 mutations → reconnect**: outbox shows 5
  pending; turning network back on drains them in op_id order; admin
  console sees them light up via Realtime.
- **Kill app mid-flight**: in_flight ops get reset to pending on next
  pickup; idempotency_keys prevents duplicate apply.
- **Force a conflict**: edit the same inspection from `psql` while a
  mobile mutation sits in the outbox; mobile op returns `conflict`,
  Sync Inspector logs it, server's row replaces local.
- **Force a 500**: temporarily change `apply_op` to `raise exception
  'boom'`; Sync Inspector shows backoff countdown and attempt counter.
- **Force a permanent error**: try to mutate another worker's
  inspection; op moves to dead-letter; tap Discard or Retry.

## Notes

- `expo-sqlite` is the on-device store; the outbox is just another
  SQLite table — same transaction guarantees as the domain rows.
- UUID v7 ids on `op_id` give natural time-ordering, so
  `ORDER BY op_id ASC` drains in the order the user took the actions.
- The `useDbQuery` hook re-runs whenever the worker emits a state
  change, so all screens stay live without TanStack mutations.
