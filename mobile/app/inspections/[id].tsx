import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import {
  getInspection,
  getCheckIn,
  getCheckOut,
  getReport,
} from '@/lib/sync/queries';
import { enqueueMutation } from '@/lib/sync/mutations';
import { uuidv7 } from '@/lib/sync/uuid';
import { useDbQuery } from '@/hooks/useDbQuery';
import type {
  Inspection,
  CheckIn,
  CheckOut,
  InspectionReport,
} from '@shared/types';

export default function InspectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inspectionId = String(id);

  const fetcher = useCallback(
    async () => ({
      inspection: await getInspection(inspectionId),
      checkIn: await getCheckIn(inspectionId),
      checkOut: await getCheckOut(inspectionId),
      report: await getReport(inspectionId),
    }),
    [inspectionId],
  );
  const { data, loading } = useDbQuery(fetcher, [inspectionId]);

  if (loading || !data) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#4ea1ff" />
      </View>
    );
  }
  const { inspection, checkIn, checkOut, report } = data;
  if (!inspection) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: '#8a939c' }}>Inspection not found.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: inspection.title }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Header inspection={inspection} />
        <CheckInBlock inspection={inspection} checkIn={checkIn} />
        <ReportBlock inspection={inspection} report={report} />
        <CheckOutBlock inspection={inspection} checkOut={checkOut} />
        <StatusBlock inspection={inspection} />
      </ScrollView>
    </>
  );
}

function Header({ inspection }: { inspection: Inspection }) {
  return (
    <View style={{ borderColor: '#1f262d', borderWidth: 1, borderRadius: 8, padding: 12 }}>
      <Text style={{ color: '#e6e9ec', fontSize: 14, fontWeight: '600' }}>
        {inspection.title}
      </Text>
      {inspection.site_address && (
        <Text style={{ color: '#8a939c', fontSize: 12, marginTop: 2 }}>
          {inspection.site_address}
        </Text>
      )}
      <Text style={{ color: '#8a939c', fontSize: 11, marginTop: 6 }}>
        Status: {inspection.status} · v{inspection.version}
      </Text>
    </View>
  );
}

function CheckInBlock({
  inspection,
  checkIn,
}: {
  inspection: Inspection;
  checkIn: CheckIn | null;
}) {
  const [busy, setBusy] = useState(false);

  async function onCheckIn() {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission required for check-in.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      await enqueueMutation({
        entity: 'check_ins',
        opType: 'insert',
        baseVersion: 0,
        payload: {
          id: uuidv7(),
          inspection_id: inspection.id,
          occurred_at: new Date().toISOString(),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
        },
      });
      // Also bump inspection.status → in_progress
      if (inspection.status === 'assigned') {
        await enqueueMutation({
          entity: 'inspections',
          opType: 'update',
          baseVersion: inspection.version,
          payload: {
            id: inspection.id,
            status: 'in_progress',
            worker_id: inspection.worker_id,
            title: inspection.title,
          },
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={blockStyle}>
      <Text style={blockTitle}>Check-in</Text>
      {checkIn ? (
        <Text style={{ color: '#8a939c', fontSize: 12 }}>
          {new Date(checkIn.occurred_at).toLocaleString()}
          {'\n'}
          {checkIn.lat.toFixed(5)}, {checkIn.lng.toFixed(5)}
        </Text>
      ) : (
        <Pressable onPress={onCheckIn} disabled={busy} style={buttonStyle}>
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={buttonLabel}>Check in (capture GPS)</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function CheckOutBlock({
  inspection,
  checkOut,
}: {
  inspection: Inspection;
  checkOut: CheckOut | null;
}) {
  const [busy, setBusy] = useState(false);

  async function onCheckOut() {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission required.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      await enqueueMutation({
        entity: 'check_outs',
        opType: 'insert',
        baseVersion: 0,
        payload: {
          id: uuidv7(),
          inspection_id: inspection.id,
          occurred_at: new Date().toISOString(),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
        },
      });
      await enqueueMutation({
        entity: 'inspections',
        opType: 'update',
        baseVersion: inspection.version,
        payload: {
          id: inspection.id,
          status: 'done',
          worker_id: inspection.worker_id,
          title: inspection.title,
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={blockStyle}>
      <Text style={blockTitle}>Check-out</Text>
      {checkOut ? (
        <Text style={{ color: '#8a939c', fontSize: 12 }}>
          {new Date(checkOut.occurred_at).toLocaleString()}
          {'\n'}
          {checkOut.lat.toFixed(5)}, {checkOut.lng.toFixed(5)}
        </Text>
      ) : (
        <Pressable onPress={onCheckOut} disabled={busy} style={buttonStyle}>
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={buttonLabel}>Check out (capture GPS)</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function ReportBlock({
  inspection,
  report,
}: {
  inspection: Inspection;
  report: InspectionReport | null;
}) {
  const [notes, setNotes] = useState(report?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const isNew = !report;

  async function onSave() {
    setBusy(true);
    try {
      if (isNew) {
        await enqueueMutation({
          entity: 'inspection_reports',
          opType: 'insert',
          baseVersion: 0,
          payload: {
            id: uuidv7(),
            inspection_id: inspection.id,
            notes,
            status: 'draft',
          },
        });
      } else {
        await enqueueMutation({
          entity: 'inspection_reports',
          opType: 'update',
          baseVersion: report!.version,
          payload: {
            id: report!.id,
            inspection_id: inspection.id,
            notes,
            status: report!.status,
          },
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={blockStyle}>
      <Text style={blockTitle}>Report</Text>
      <TextInput
        multiline
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes from the site…"
        placeholderTextColor="#475058"
        style={{
          color: '#e6e9ec',
          borderWidth: 1,
          borderColor: '#1f262d',
          borderRadius: 6,
          padding: 10,
          minHeight: 80,
          textAlignVertical: 'top',
        }}
      />
      <Pressable onPress={onSave} disabled={busy} style={[buttonStyle, { marginTop: 8 }]}>
        {busy ? <ActivityIndicator color="#000" /> : <Text style={buttonLabel}>Save report</Text>}
      </Pressable>
    </View>
  );
}

function StatusBlock({ inspection }: { inspection: Inspection }) {
  return (
    <View style={blockStyle}>
      <Text style={blockTitle}>Status</Text>
      <Text style={{ color: '#8a939c', fontSize: 12 }}>
        {inspection.status} · v{inspection.version}
      </Text>
      <Text style={{ color: '#8a939c', fontSize: 11, marginTop: 4 }}>
        Status auto-advances on check-in (→ in_progress) and check-out (→ done).
      </Text>
    </View>
  );
}

const blockStyle = {
  borderColor: '#1f262d',
  borderWidth: 1,
  borderRadius: 8,
  padding: 12,
  gap: 8,
} as const;
const blockTitle = {
  color: '#e6e9ec',
  fontSize: 13,
  fontWeight: '600' as const,
  marginBottom: 4,
};
const buttonStyle = {
  backgroundColor: '#4ea1ff',
  paddingVertical: 12,
  borderRadius: 6,
  alignItems: 'center' as const,
};
const buttonLabel = {
  color: '#000',
  fontWeight: '600' as const,
  fontSize: 13,
};
