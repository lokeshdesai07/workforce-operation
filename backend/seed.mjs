// Fallback seed script if supabase/seed.sql is incompatible with your
// GoTrue version. Uses the supported auth.admin API.
//
// Usage:
//   1. supabase start
//   2. supabase db reset      (applies migrations; ignore seed.sql errors)
//   3. SUPABASE_URL=http://127.0.0.1:54321 \
//      SERVICE_ROLE_KEY=<from `supabase status`> \
//      node seed.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = process.env.SERVICE_ROLE_KEY;
if (!key) {
  console.error('SERVICE_ROLE_KEY env var required');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function ensureUser(email, password) {
  const { data: list } = await sb.auth.admin.listUsers();
  const found = list.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

const adminId = await ensureUser('admin@example.com', 'admin1234');
const workerId = await ensureUser('worker@example.com', 'worker1234');

await sb.from('admins').upsert({ id: adminId });
await sb.from('workers').upsert({
  id: workerId,
  full_name: 'Demo Worker',
  phone: '+1-555-0100',
});

console.log('Seeded:');
console.log('  admin@example.com  / admin1234');
console.log('  worker@example.com / worker1234');
