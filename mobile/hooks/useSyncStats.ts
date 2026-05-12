import { useEffect, useState } from 'react';
import { syncStats } from '@/lib/sync/queries';
import { subscribeSyncState } from '@/lib/sync/worker';
import type { SyncStats } from '@/lib/sync/types';

export function useSyncStats(intervalMs = 1000): SyncStats {
  const [stats, setStats] = useState<SyncStats>({ pending: 0, inFlight: 0, dead: 0, conflicts: 0 });
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const s = await syncStats();
      if (mounted) setStats(s);
    };
    tick();
    const sub = subscribeSyncState(tick);
    const t = setInterval(tick, intervalMs);
    return () => {
      mounted = false;
      sub();
      clearInterval(t);
    };
  }, [intervalMs]);
  return stats;
}
