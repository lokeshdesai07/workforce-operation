import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { listInspections } from '@/lib/sync/queries';
import { pullChanges } from '@/lib/sync/pull';
import { supabase } from '@/lib/supabase/client';
import { useSyncStats } from '@/hooks/useSyncStats';
import { useDbQuery } from '@/hooks/useDbQuery';
import type { Inspection } from '@shared/types';

export default function InspectionsList() {
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const stats = useSyncStats();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setWorkerId(data.user?.id ?? null));
  }, []);

  const fetcher = useCallback(
    () => (workerId ? listInspections(workerId) : Promise.resolve([])),
    [workerId],
  );
  const { data, loading } = useDbQuery<Inspection[]>(fetcher, [workerId]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await pullChanges();
    } finally {
      setRefreshing(false);
    }
  }

  if (!workerId || loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#4ea1ff" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'My inspections',
          headerRight: () => (
            <Pressable onPress={() => router.push('/sync-inspector')} hitSlop={8}>
              <Text style={{ color: '#4ea1ff', marginRight: 8 }}>
                ⚙ {stats.pending + stats.inFlight}
                {stats.dead > 0 ? `  ✗${stats.dead}` : ''}
                {stats.conflicts > 0 ? `  !${stats.conflicts}` : ''}
              </Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={data ?? []}
        keyExtractor={(it) => it.id}
        refreshControl={
          <RefreshControl tintColor="#4ea1ff" refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={{ padding: 32 }}>
            <Text style={{ color: '#8a939c' }}>
              No inspections yet. Pull to refresh — admin assigns inspections from the
              ops console.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/inspections/${item.id}`)}
            style={({ pressed }) => ({
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#1f262d',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: '#e6e9ec', fontSize: 15, fontWeight: '500' }}>
              {item.title}
            </Text>
            {item.site_address && (
              <Text style={{ color: '#8a939c', fontSize: 12, marginTop: 2 }}>
                {item.site_address}
              </Text>
            )}
            <Text
              style={{
                color: statusColor(item.status),
                fontSize: 11,
                marginTop: 4,
                textTransform: 'uppercase',
              }}
            >
              {item.status} · v{item.version}
            </Text>
          </Pressable>
        )}
      />
    </>
  );
}

function statusColor(s: string) {
  if (s === 'done') return '#7ed29c';
  if (s === 'in_progress') return '#f0b65b';
  return '#8a939c';
}
