# Workforce Operations — Offline Sync (Part 1)

A focused, isolated implementation of the offline-sync engine for a workforce
operations platform. The deliverable proves out **queue persistence**,
**reconciliation**, **retry handling**, and **idempotent server writes** end
to end — without committing to the full app surface.

---

## 1. Goal & non-goals

**Goal.** Demonstrate a production-shaped sync engine for a field-worker
mobile app, with a thin **ops console** (Next.js admin) that creates worker
accounts, assigns inspection tasks, and proves the worker's offline edits
land correctly on the server. The console is intentionally narrow — it
demonstrates the *operational loop* end to end without becoming a second
product surface.

**Non-goals (Part 1).**

- Manual merge UI for conflicts. Server-authoritative LWW with a conflict
  log is enough to make the engine demonstrable; a side-by-side merge UI is
  Part 2.
- Geofencing background triggers. GPS is captured at check-in, but
  background geofence-driven auto-check-in is Part 2.
- Scheduling / shift management. The brief mentions it; it is its own
  problem domain and is not what the sync engine needs to prove.
- Multi-tenancy / org administration. Single tenant, single admin role,
  single worker role.
- Worker self-signup. All worker accounts are created by the admin. This
  is realistic for workforce ops (workers don't sign themselves up) and
  keeps the auth surface small.

---

## 2. Repository layout

```
workforce-operation/
├── mobile/        # Expo (React Native) — the field worker app
├── admin/         # Next.js — read-only viewer subscribed via Realtime
├── backend/       # Supabase migrations, RLS, seed data, shared TS types
├── ARCHITECTURE.md
└── README.md
```

`backend/types.ts` is generated from the Supabase schema and imported by
both `mobile/` and `admin/`. One source of truth for the wire contract, no
monorepo tooling required.

---

## 3. Domain (the smallest realistic slice)

The ops admin creates **worker** accounts and assigns **inspections** to
them. At each inspection a worker performs a **check-in** (with GPS) and
a **check-out**, and they fill a small **inspection report** form
(notes, status). All four entities flow through the sync engine.

```
admin  ──▶  workers       (created in admin → auth.users + profile row)
              │
              ▼
            inspections   (assigned by admin)
              │
              ├── check_in            (one — mobile-only)
              ├── check_out           (one — mobile-only)
              └── inspection_report   (one — mobile-only)
```

Why this slice: it forces every sync concern into the open — admin-side
writes that pull down to the phone, mobile-side writes that push up,
ordered mutations against the same parent, partial offline edits, two
devices potentially editing the same inspection, and a clear server-side
notion of "canonical state" the admin can display.

---

## 4. High-level architecture

```
┌─────────────────────────── mobile (Expo) ───────────────────────────┐
│                                                                     │
│   UI (expo-router, TanStack Query)                                  │
│        │                                                            │
│        ▼                                                            │
│   Mutation API ───────────┐                                         │
│        │                  │ (single transaction)                    │
│        ▼                  ▼                                         │
│   ┌────────────┐    ┌────────────┐                                  │
│   │ domain     │    │ outbox     │                                  │
│   │ tables     │    │ (op_id,    │                                  │
│   │ (SQLite)   │    │  payload,  │                                  │
│   │            │    │  attempts) │                                  │
│   └─────┬──────┘    └─────┬──────┘                                  │
│         │                 │                                         │
│         │                 ▼                                         │
│         │           Sync worker  ◀── NetInfo / AppState / timer     │
│         │                 │                                         │
│         │                 │ HTTPS (idempotent RPC)                  │
│         ▼                 ▼                                         │
│   Realtime pull  ◀── Supabase ───── server-authoritative apply      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                ┌──────────────────────────────────┐
                │ admin (Next.js)                  │
                │   ─ create worker (server route) │
                │   ─ create / assign inspection   │
                │   ─ live read: inspections,      │
                │     conflicts, idempotency log   │
                └──────────────────────────────────┘
```

Two principles drive the shape:

1. **SQLite is the source of truth on-device.** UI reads from SQLite via
   TanStack Query. The network is an *eventual* effect, never a UI
   dependency.
2. **One writer per entity** (column-level where needed). Admin owns
   `workers` and `inspections` metadata; mobile owns `inspections.status`
   and all of `check_ins`, `check_outs`, `inspection_reports`. This split
   keeps the sync engine's failure modes small and reasonable — every bug
   in a given column has exactly one client-side origin.

---

## 5. Data model

### 5.1 Server (Postgres / Supabase)

```sql
-- Identity (created by admin server route via service-role)
workers (                                 -- profile row, 1:1 with auth.users
  id            uuid primary key references auth.users(id),
  full_name     text not null,
  phone         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
)

-- Domain
inspections (
  id            uuid primary key,
  worker_id     uuid not null references workers(id),
  title         text not null,           -- e.g. "HVAC inspection — 12 Main St"
  site_address  text,
  status        text not null,           -- 'assigned' | 'in_progress' | 'done'
  updated_at    timestamptz not null default now(),
  version       integer not null default 1,
  deleted_at    timestamptz
)

check_ins (
  id            uuid primary key,
  inspection_id uuid not null references inspections(id),
  occurred_at   timestamptz not null,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    real,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
)

check_outs (
  id            uuid primary key,
  inspection_id uuid not null references inspections(id),
  occurred_at   timestamptz not null,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    real,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
)

inspection_reports (
  id            uuid primary key,
  inspection_id uuid not null references inspections(id),
  notes         text,
  status        text not null,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
)

-- Sync infrastructure
idempotency_keys (
  op_id         uuid primary key,        -- client-generated UUID v7
  worker_id     uuid not null,
  applied_at    timestamptz not null default now(),
  result_hash   text                     -- so safe-retry returns same answer
)

sync_conflicts (
  id            bigserial primary key,
  op_id         uuid not null,
  entity        text not null,           -- 'inspections' | 'check_ins'
                                          --  | 'check_outs' | 'inspection_reports'
  entity_id     uuid not null,
  client_version integer not null,
  server_version integer not null,
  client_payload jsonb not null,
  server_snapshot jsonb not null,
  resolved_as   text not null,           -- 'server_wins' (LWW)
  detected_at   timestamptz not null default now()
)
```

**RLS (sketch).** Workers can read their own `workers` row + their own
`inspections` and child rows; they can write check-ins, check-outs,
reports, and update only `inspections.status` for their own rows. The
admin uses the service-role key (server-side only) for `workers` insert
and `inspections` insert / reassign.

`updated_at` and `version` together drive reconciliation. `version`
increments on every server apply; the client sends the version it *based
its mutation on*, and the server rejects (or downgrades to conflict-log) if
the server version has moved past it.

### 5.2 Client (SQLite)

Mirrors the domain tables above, plus:

```sql
outbox (
  op_id         text primary key,         -- UUID v7, also the idempotency key
  entity        text not null,
  entity_id     text not null,
  op_type       text not null,            -- 'insert' | 'update' | 'delete'
  payload       text not null,            -- JSON
  base_version  integer not null,         -- server version this op was based on
  attempts      integer not null default 0,
  next_attempt_at integer not null,       -- epoch ms
  last_error    text,
  state         text not null default 'pending'
                                          -- 'pending' | 'in_flight' | 'dead'
)

sync_meta (
  key text primary key,
  value text not null
)
-- sync_meta keys: 'last_pull_cursor' (per entity), 'last_full_sync_at'
```

UUID v7 for `op_id` gives natural time-ordering and lets the worker drain
the queue in insertion order without a separate sequence column.

---

## 6. Sync protocol

### 6.1 Mutation path (client write)

```
user action
   │
   ▼
beginTransaction()
   ├── upsert into domain table  (optimistic UI sees this immediately)
   └── insert into outbox        (op_id = uuid_v7(), state = 'pending')
commit()
   │
   ▼
TanStack Query invalidation → UI updates
   │
   ▼
Sync worker wakes (debounced 500ms)
```

The single transaction is critical: if the app is killed between the
domain write and the outbox write, the outbox would never know about it.
SQLite transactions guarantee they land together or not at all.

### 6.2 Push (drain outbox)

```
loop while online and outbox has 'pending' rows:
    op = oldest pending where next_attempt_at <= now
    mark op 'in_flight'
    POST /rpc/apply_op { op_id, entity, op_type, payload, base_version }
    server response:
        200 applied      → delete outbox row, write returned canonical row to SQLite
        200 duplicate    → delete outbox row (idempotency hit, op already applied)
        409 conflict     → server logged it to sync_conflicts; pull canonical;
                          delete outbox row; surface conflict badge in UI
        4xx other        → mark 'dead', do not retry
        5xx / network    → increment attempts, set next_attempt_at = now + backoff,
                          mark 'pending'; if attempts >= 8 → mark 'dead'
```

**One op at a time, per entity_id.** Parallel drains are tempting but make
ordering bugs likely; the queue is rarely deep enough in practice for
parallelism to matter.

**Idempotency.** The server checks `idempotency_keys` before applying. If
the op_id is already there, it returns the prior result. This makes the
"network ack lost mid-flight" case safe — the client retries, the server
no-ops, the client deletes the outbox row.

### 6.3 Pull (server → client)

Two channels:

1. **Cursor pull** on app foreground / pull-to-refresh:
   `GET /rpc/changes_since?cursor=<last_pull_cursor>` returns rows where
   `updated_at > cursor`, ordered by `updated_at`. Cursor advances on
   success.
2. **Realtime** (Supabase Realtime) while the app is foregrounded — the
   same rows arrive live, applied with the same merge logic. Cursor still
   advances so a later background fetch is consistent.

Both channels apply rows the same way: server wins, client SQLite is
overwritten, TanStack Query invalidates.

### 6.4 Reconciliation rules

- **Server is canonical.** No CRDTs, no client-side three-way merge.
- On every push, server checks `client.base_version == server.version`:
  - Equal → apply, increment server version, return canonical row.
  - Different → write to `sync_conflicts` with both snapshots,
    return canonical row, client overlays canonical and shows a badge.
- Deletes are tombstones: `deleted_at` set, row remains for sync. Client
  filters them out of the UI but keeps them in SQLite for ordering.

This is deliberately simple. The writeup will note that for *truly*
collaborative data (e.g. shared notes) CRDTs are the right tool, but for
workforce ops the server is always the system of record and LWW + a
conflict log is what teams actually run.

### 6.5 Retry & backoff

```
attempts: 0  1   2   3   4   5    6    7
backoff:  1s 2s  4s  8s 16s 32s  64s  128s     (cap 5 min)
                                        │
                                        └── attempt 8 → state = 'dead'
```

Dead ops are listed in the **Sync Inspector** screen. The user can
**Retry** (resets attempts, sets `next_attempt_at = now`) or **Discard**
(deletes the outbox row and reverts the local domain row from the server's
canonical state on next pull).

---

## 7. Failure scenarios (the demo script)

Each is recorded / scripted; each is the answer to a real client question.

| # | Scenario | Expected behavior |
|---|---|---|
| 1 | Airplane mode, make 5 mutations, reconnect | All 5 apply in op_id order; outbox empties; admin sees them appear via Realtime |
| 2 | Kill app mid-flight | On relaunch, in-flight ops reset to pending; idempotency_keys ensures no duplicate apply |
| 3 | Same inspection edited on two devices | Device A wins (higher version); device B's op logged in sync_conflicts; B's UI shows conflict badge |
| 3b | Admin reassigns inspection while worker is offline editing it | Admin write lands; worker's later push picks up canonical state on pull; no conflict because columns don't overlap (admin owns `worker_id`, mobile owns `status`) |
| 4 | Forced 500 from server | Visible backoff in Sync Inspector (countdown to next retry); eventual success |
| 5 | Permanent 4xx (e.g. validation) | Op marked dead; surfaced in Sync Inspector; user can Discard |

---

## 8. Mobile app surface

Four screens, no more.

1. **Login** — Supabase email/password using credentials the admin issued.
   No self-signup.
2. **Inspection list** — assigned inspections, pulled + cached. Works
   fully offline after first sync.
3. **Inspection detail** — check-in (GPS + timestamp), report form,
   check-out. Each action is a single mutation that writes locally and
   queues for sync.
4. **Sync Inspector** — outbox depth, in-flight ops, retry countdowns,
   conflict log, dead-letter queue with Retry/Discard buttons.

The Sync Inspector is what makes the engine *demonstrable* without a
debugger. It is the most important screen in the deliverable.

---

## 9. Admin surface (ops console)

A small Next.js app — one page is enough — with two write actions and
three live read panels.

**Write (admin → server, server-side only via service-role key):**

1. **Create worker** — form: full name, email, phone, temp password.
   Server route calls `supabase.auth.admin.createUser()` then inserts the
   matching `workers` profile row in a single transaction.
2. **Create / assign inspection** — form: pick worker, title, site
   address. Inserts a row into `inspections` with `status = 'assigned'`.
   Reassign reuses the same form to update `worker_id`.

**Read (live, via Supabase Realtime):**

3. **Workers** — list of accounts the admin has issued.
4. **Inspections** — live table; rows light up as workers progress through
   `assigned → in_progress → done`.
5. **Conflict log** — recent `sync_conflicts` entries with both snapshots.
6. **Idempotency log** — proves retried ops did not duplicate.

**Auth.** Admin signs in with a separate admin account (seeded). The
service-role key lives only in the Next.js server runtime — never sent to
the browser. Worker accounts have no admin access; admin accounts cannot
log into the mobile app.

**Why the writes are limited to these two.** Everything else (status,
check-ins, reports) belongs to the worker. The admin cannot edit those
from the console. This keeps the *sync entities* (the ones with conflict
logic) under a single writer — the mobile app — while still demonstrating
the operational loop.

---

## 10. Decisions & tradeoffs

| Decision | Why | Tradeoff accepted |
|---|---|---|
| Outbox pattern over event sourcing | Simpler to reason about; matches a CRUD-shaped domain; easy to inspect | No replay-from-event-log; not suitable if audit trail were a hard requirement |
| Server-authoritative LWW + version | Workforce ops always has a system of record; CRDTs are overkill | Cannot merge concurrent edits to different fields of the same row — last writer wins |
| UUID v7 op_ids | Time-ordered, no sequence column, naturally unique across devices | Slightly larger than int IDs, but operationally invisible |
| One-at-a-time drain | Eliminates ordering bugs; queues are shallow in practice | Lower throughput on large backlogs (acceptable for field workers) |
| SQLite as on-device source of truth (not AsyncStorage) | Transactional writes; structured queries; the outbox needs a real DB | More setup than AsyncStorage; pays for itself immediately |
| TanStack Query reading from SQLite | Cache invalidation + reactive UI without rolling our own | Slight overhead in wiring |
| Admin writes only `workers` and `inspections` metadata | Demonstrates the full ops loop (assign → execute → verify) without giving conflict-prone columns two writers | Admin can't edit reports / status, but that mirrors how real workforce platforms operate |
| Worker accounts created by admin (no self-signup) | Realistic for workforce ops; smaller auth surface | Admin needs a server route with service-role key — slight extra plumbing |
| Service-role key only in Next.js server runtime | Standard Supabase pattern; browser never sees privileged credentials | Adds Next.js Route Handler / Server Action — necessary anyway |

---

## 11. What Part 2 would add

These are intentionally **not** in Part 1 but are the natural extensions
the writeup will reference, mapped to the rest of the client's brief:

- **Geofencing + auto check-in** via `expo-location` background updates.
  (Brief: "GPS / geofencing".)
- **Scheduling / shift management** as its own bounded context, syncing
  through the same engine. (Brief: "scheduling".)
- **Manual merge UI** for conflicts (side-by-side fields, user picks).
- **Background sync** via `expo-task-manager` + `expo-background-fetch`
  for true offline-to-online drain without the app open.
- **Multi-tenant RLS** and ops-side write workflows.
- **Observability**: per-op latency, queue depth, conflict rate piped to
  Sentry / a metrics endpoint.

---

## 12. Build order

The sync engine is built before any UI. The doc above is organized
top-down (UI inwards), but the build order is bottom-up:

1. Supabase schema + RLS + idempotency table + conflict table
2. Admin Next.js: create-worker server route + create-inspection form
   (so we can seed real test data through the real path, not SQL inserts)
3. SQLite schema + migrations + outbox table on mobile
4. Mutation API (single-transaction write to domain + outbox)
5. Sync worker (drain, idempotency, backoff, dead-letter)
6. Pull (cursor + Realtime)
7. Sync Inspector screen (so the engine is demonstrable before any feature UI)
8. Mobile: Login + Inspection list + Inspection detail screens
9. Admin live read panels (inspections, conflicts, idempotency)

This ordering is itself a deliverable signal: *"I built the sync contract
first, screens second."*
