'use client';

import { LiveTable } from './LiveTable';
import type { IdempotencyKey } from '@shared/types';

export function LiveIdempotency() {
  return (
    <LiveTable<IdempotencyKey>
      title="Idempotency log"
      table="idempotency_keys"
      orderBy="applied_at"
      ascending={false}
      empty="No ops applied yet."
      columns={[
        {
          key: 'op_id',
          label: 'op_id',
          render: (r) => (r.op_id as string).slice(0, 8) + '…',
        },
        { key: 'entity', label: 'Entity' },
        {
          key: 'entity_id',
          label: 'Row',
          render: (r) => (r.entity_id as string).slice(0, 8) + '…',
        },
        {
          key: 'applied_at',
          label: 'Applied',
          render: (r) => new Date(r.applied_at).toLocaleTimeString(),
        },
      ]}
    />
  );
}
