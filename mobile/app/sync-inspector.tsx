import { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { listOutbox, listConflicts } from '@/lib/sync/queries';
import {
  retryDead,
  discardDead,
  kickSyncWorker,
  isOnline,
} from '@/lib/sync/worker';
import { pullChanges } from '@/lib/sync/pull';
import { supabase } from '@/lib/supabase/client';
import { useDbQuery } from '@/hooks/useDbQuery';
import { useSyncStats } from '@/hooks/useSyncStats';

export default function SyncInspector() {
  const fetcher = useCallback(
    async () => ({
      ops: await listOutbox(),
      conflicts: await listConflicts(),
    }),
    [],
  );
  const { data } = useDbQuery(fetcher, []);
  const stats = useSyncStats();

  return (
    <>
      <Stack.Screen options={{ title: 'Sync Inspector' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={card}>
          <Text style={cardTitle}>Connectivity</Text>
          <Text style={{ color: isOnline() ? '#7ed29c' : '#f0b65b', fontSize: 12 }}>
            {isOnline() ? '● online' : '○ offline'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable onPress={() => kickSyncWorker()} style={btnSecondary}>
              <Text style={btnSecondaryLabel}>Force drain</Text>
            </Pressable>
            <Pressable onPress={() => pullChanges()} style={btnSecondary}>
              <Text style={btnSecondaryLabel}>Force pull</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await supabase.auth.signOut();
              }}
              style={btnSecondary}
            >
              <Text style={btnSecondaryLabel}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <View style={card}>
          <Text style={cardTitle}>Queue summary</Text>
          <Stat label="Pending"   value={stats.pending} />
          <Stat label="In flight" value={stats.inFlight} />
          <Stat label="Dead"      value={stats.dead} />
          <Stat label="Conflicts" value={stats.conflicts} />
        </View>

        <View style={card}>
          <Text style={cardTitle}>Outbox ({data?.ops.length ?? 0})</Text>
          {(data?.ops ?? []).length === 0 ? (
            <Text style={muted}>Empty.</Text>
          ) : (
            (data?.ops ?? []).map((op) => (
              <View
                key={op.op_id}
                style={{
                  borderTopColor: '#1f262d',
                  borderTopWidth: 1,
                  paddingTop: 8,
                  marginTop: 8,
                  gap: 2,
                }}
              >
                <Text style={{ color: '#e6e9ec', fontSize: 12 }}>
                  {op.entity} · {op.op_type} · v{op.base_version}
                </Text>
                <Text style={{ color: stateColor(op.state), fontSize: 11 }}>
                  {op.state}
                  {op.attempts > 0 ? ` · attempt ${op.attempts}` : ''}
                  {op.state === 'pending' && op.next_attempt_at > Date.now()
                    ? ` · retry in ${Math.ceil((op.next_attempt_at - Date.now()) / 1000)}s`
                    : ''}
                </Text>
                {op.last_error && (
                  <Text style={{ color: '#f0b65b', fontSize: 10 }}>{op.last_error}</Text>
                )}
                {op.state === 'dead' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <Pressable onPress={() => retryDead(op.op_id)} style={btnSecondary}>
                      <Text style={btnSecondaryLabel}>Retry</Text>
                    </Pressable>
                    <Pressable onPress={() => discardDead(op.op_id)} style={btnSecondary}>
                      <Text style={btnSecondaryLabel}>Discard</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        <View style={card}>
          <Text style={cardTitle}>Conflicts ({data?.conflicts.length ?? 0})</Text>
          {(data?.conflicts ?? []).length === 0 ? (
            <Text style={muted}>None.</Text>
          ) : (
            (data?.conflicts ?? []).map((c) => (
              <View key={c.id} style={{ marginTop: 8, gap: 2 }}>
                <Text style={{ color: '#e6e9ec', fontSize: 12 }}>
                  {c.entity} {c.entity_id.slice(0, 8)}…
                </Text>
                <Text style={{ color: '#8a939c', fontSize: 11 }}>
                  client v{c.client_version} → server v{c.server_version} · server wins
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={{ color: '#8a939c', fontSize: 12 }}>{label}</Text>
      <Text style={{ color: '#e6e9ec', fontSize: 12 }}>{value}</Text>
    </View>
  );
}

function stateColor(s: string) {
  if (s === 'pending') return '#f0b65b';
  if (s === 'in_flight') return '#4ea1ff';
  if (s === 'dead') return '#e26a6a';
  return '#8a939c';
}

const card = {
  borderColor: '#1f262d',
  borderWidth: 1,
  borderRadius: 8,
  padding: 12,
  backgroundColor: '#14181d',
} as const;
const cardTitle = {
  color: '#e6e9ec',
  fontSize: 13,
  fontWeight: '600' as const,
  marginBottom: 6,
};
const muted = { color: '#8a939c', fontSize: 12 };
const btnSecondary = {
  borderColor: '#1f262d',
  borderWidth: 1,
  borderRadius: 4,
  paddingVertical: 6,
  paddingHorizontal: 10,
};
const btnSecondaryLabel = { color: '#e6e9ec', fontSize: 11 };
