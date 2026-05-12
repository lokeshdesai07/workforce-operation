# admin

Next.js (App Router) ops console. Two write actions, four live read panels.

## Layout

```
admin/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                # ops console (gated by requireAdmin())
│   ├── login/page.tsx
│   ├── globals.css
│   └── api/
│       ├── workers/route.ts    # POST = create worker (service-role)
│       └── inspections/route.ts # POST/PATCH = create / reassign
├── components/
│   ├── CreateWorkerForm.tsx
│   ├── CreateInspectionForm.tsx
│   ├── LiveTable.tsx           # generic Realtime-subscribed table
│   ├── LiveWorkers.tsx
│   ├── LiveInspections.tsx
│   ├── LiveConflicts.tsx
│   ├── LiveIdempotency.tsx
│   └── SignOutButton.tsx
├── lib/
│   ├── auth.ts                 # requireAdmin() server helper
│   └── supabase/
│       ├── browser.ts          # @supabase/ssr browser client
│       ├── server.ts           # SSR server client (cookies)
│       ├── admin.ts            # service-role client (server-only)
│       └── middleware.ts       # session refresh / redirect
├── middleware.ts               # uses lib/supabase/middleware
├── package.json / tsconfig.json / next.config.mjs / ...
```

## Run

```bash
cd admin
cp .env.example .env.local      # fill values from `supabase start`
npm install
npm run dev                     # http://localhost:3000
```

Sign in with `admin@example.com / admin1234` (seeded). Worker accounts
cannot reach this UI — `requireAdmin()` redirects them.

## Key invariants

- The **service-role key never reaches the browser**. `lib/supabase/admin.ts`
  is marked `'server-only'`; importing it from a client component is a
  build-time error.
- Admin writes only `workers` (auth + profile) and `inspections`
  (metadata: title, site, worker_id). Worker-side mutations
  (`status`, `check_ins`, `check_outs`, `inspection_reports`) flow through
  the mobile sync engine via `apply_op` — admin cannot fast-path them.
- Live panels subscribe to Postgres changes via Supabase Realtime, so
  every worker action shows up in the dashboard within a second.
