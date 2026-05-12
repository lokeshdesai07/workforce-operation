'use client';

import { LiveTable } from './LiveTable';
import type { SyncConflict } from '@shared/types';

export function LiveConflicts() {
  return (
    <LiveTable<SyncConflict>
      title="Conflict log"
      table="sync_conflicts"
      orderBy="detected_at"
      ascending={false}
      empty="No conflicts detected. (Force one by editing the same row from two devices.)"
      columns={[
        { key: 'entity', label: 'Entity' },
        {
          key: 'entity_id',
          label: 'Row',
          render: (r) => (r.entity_id as string).slice(0, 8) + '…',
        },
        {
          key: 'client_version',
          label: 'Versions',
          render: (r) => `${r.client_version} → ${r.server_version}`,
        },
        { key: 'resolved_as', label: 'Resolution' },
        {
          key: 'detected_at',
          label: 'When',
          render: (r) => new Date(r.detected_at).toLocaleTimeString(),
        },
      ]}
    />
  );
}
