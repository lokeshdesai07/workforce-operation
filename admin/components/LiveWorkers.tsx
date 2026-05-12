'use client';

import { LiveTable } from './LiveTable';
import type { Worker } from '@shared/types';

export function LiveWorkers() {
  return (
    <LiveTable<Worker>
      title="Workers"
      table="workers"
      orderBy="created_at"
      ascending={false}
      empty="No workers yet — create one above."
      columns={[
        { key: 'full_name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        {
          key: 'active',
          label: 'Active',
          render: (r) => (r.active ? '●' : '○'),
        },
        {
          key: 'created_at',
          label: 'Created',
          render: (r) => new Date(r.created_at).toLocaleString(),
        },
      ]}
    />
  );
}
