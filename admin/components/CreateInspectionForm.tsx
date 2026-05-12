'use client';

import { useEffect, useState } from 'react';
import type { Worker } from '@shared/types';

export function CreateInspectionForm({ onCreated }: { onCreated?: () => void }) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function loadWorkers() {
    try {
      const res = await fetch('/api/workers');
      const json = await res.json();
      if (res.ok) {
        setWorkers(json.workers as Worker[]);
        if (!workerId && json.workers.length > 0) {
          setWorkerId((json.workers as Worker[])[0].id);
        }
      }
    } catch {
      // best-effort load; show empty list
    }
  }

  useEffect(() => {
    loadWorkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          worker_id: workerId,
          title,
          site_address: siteAddress || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'failed');
      setOk('Inspection assigned. Worker will see it on next sync.');
      setTitle('');
      setSiteAddress('');
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
      <h2 className="text-sm font-semibold">Assign inspection</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select
          required
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          className="bg-transparent border border-[var(--border)] rounded p-2 text-sm"
        >
          {workers.length === 0 && <option value="">No workers yet</option>}
          {workers.map((w) => (
            <option key={w.id} value={w.id} className="bg-[var(--panel)]">
              {w.full_name}
            </option>
          ))}
        </select>
        <input
          required
          placeholder="Title (e.g. HVAC inspection — 12 Main St)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-transparent border border-[var(--border)] rounded p-2 text-sm"
        />
        <input
          placeholder="Site address (optional)"
          value={siteAddress}
          onChange={(e) => setSiteAddress(e.target.value)}
          className="bg-transparent border border-[var(--border)] rounded p-2 text-sm md:col-span-2"
        />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {ok && <p className="text-green-400 text-xs">{ok}</p>}
      <button
        type="submit"
        disabled={busy || !workerId}
        className="bg-[var(--accent)] text-black px-4 py-2 rounded text-sm disabled:opacity-50"
      >
        {busy ? 'Assigning…' : 'Assign inspection'}
      </button>
    </form>
  );
}
