import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '@/lib/db';
import { startSyncWorker } from '@/lib/sync/worker';
import { startRealtime, pullChanges } from '@/lib/sync/pull';
import { supabase } from '@/lib/supabase/client';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stopWorker: (() => void) | null = null;
    let stopRealtime: (() => void) | null = null;

    (async () => {
      await getDb();              // ensures schema is created before anything else
      setReady(true);

      // Start sync only if signed in. Re-run on auth changes.
      const startIfAuthed = async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          stopWorker?.();
          stopRealtime?.();
          stopWorker = startSyncWorker();
          stopRealtime = startRealtime();
          // Initial cursor pull (best-effort)
          pullChanges().catch(() => {});
        } else {
          stopWorker?.();
          stopRealtime?.();
          stopWorker = null;
          stopRealtime = null;
        }
      };

      const { data: sub } = supabase.auth.onAuthStateChange(() => {
        void startIfAuthed();
      });
      void startIfAuthed();

      return () => sub.subscription.unsubscribe();
    })();

    return () => {
      stopWorker?.();
      stopRealtime?.();
    };
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0b0d10' }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#0b0d10' },
            headerTintColor: '#e6e9ec',
            contentStyle: { backgroundColor: '#0b0d10' },
          }}
        />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
