'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin1234');
  const [error, setError] = useState<string | null>(
    search.get('error') === 'not_admin' ? 'That account is not an admin.' : null,
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 border border-[var(--border)] bg-[var(--panel)] p-6 rounded"
      >
        <h1 className="text-lg font-semibold">Workforce Ops — Admin</h1>
        <label className="block">
          <span className="text-xs text-[var(--muted)]">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 bg-transparent border border-[var(--border)] rounded p-2"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--muted)]">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 bg-transparent border border-[var(--border)] rounded p-2"
            required
          />
        </label>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[var(--accent)] text-black py-2 rounded disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-xs text-[var(--muted)]">
          Admin credentials only. Workers sign in via the mobile app.
        </p>
      </form>
    </main>
  );
}
