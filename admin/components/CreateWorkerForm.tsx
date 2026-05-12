'use client';

import { useState } from 'react';

export function CreateWorkerForm({ onCreated }: { onCreated?: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          phone: phone || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'failed');
      setOk(`Worker created (${email}). They can now sign in to the mobile app.`);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 border border-[var(--border)] bg-[var(--panel)] p-4 rounded"
    >
      <h2 className="text-sm font-semibold">Create worker</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          required
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="bg-transparent border border-[var(--border)] rounded p-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-transparent border border-[var(--border)] rounded p-2 text-sm"
        />
        <input
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="bg-transparent border border-[var(--border)] rounded p-2 text-sm"
        />
        <input
          required
          type="text"
          placeholder="Temp password (>= 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-transparent border border-[var(--border)] rounded p-2 text-sm"
          minLength={8}
        />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {ok && <p className="text-green-400 text-xs">{ok}</p>}
      <button
        type="submit"
        disabled={busy}
        className="bg-[var(--accent)] text-black px-4 py-2 rounded text-sm disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create worker'}
      </button>
    </form>
  );
}
