import { useEffect, useState, useCallback } from 'react';
import { subscribeSyncState } from '@/lib/sync/worker';

// Lightweight hook: re-runs `fetcher` whenever the sync engine notifies
// of a state change, plus a manual refetch trigger.
export function useDbQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const v = await fetcher();
      setData(v);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetcher().then((v) => mounted && setData(v)).finally(() => mounted && setLoading(false));
    const unsub = subscribeSyncState(() => {
      fetcher().then((v) => mounted && setData(v));
    });
    return () => {
      mounted = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, refetch };
}
