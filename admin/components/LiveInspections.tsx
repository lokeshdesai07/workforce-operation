'use client';

import { LiveTable } from './LiveTable';
import type { Inspection } from '@shared/types';

const statusColor: Record<string, string> = {
  assigned: 'text-[var(--muted)]',
  in_progress: 'text-yellow-300',
  done: 'text-green-300',
};

export function LiveInspections() {
  return (
    <LiveTable<Inspection>
      title="Inspections (live)"
      table="inspections"
      orderBy="updated_at"
      ascending={false}
      empty="No inspections yet — assign one above."
      columns={[
        { key: 'title', label: 'Title' },
        { key: 'site_address', label: 'Site' },
        {
          key: 'status',
          label: 'Status',
          render: (r) => (
            <span className={statusColor[r.status] ?? ''}>
              {r.status} v{r.version}
            </span>
          ),
        },
        {
          key: 'updated_at',
          label: 'Updated',
          render: (r) => new Date(r.updated_at).toLocaleTimeString(),
        },
      ]}
    />
  );
}
