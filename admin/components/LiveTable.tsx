'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type Column<T> = {
  key: keyof T;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
};

interface LiveTableProps<T extends { id?: string | number }> {
  title: string;
  table: string;
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  columns: Column<T>[];
  empty?: string;
}

export function LiveTable<T extends { id?: string | number }>({
  title,
  table,
  orderBy = 'created_at',
  ascending = false,
  limit = 25,
  columns,
  empty,
}: LiveTableProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let mounted = true;

    async function load() {
      const { data } = await supabase
        .from(table)
        .select('*')
        .order(orderBy, { ascending })
        .limit(limit);
      if (mounted) {
        setRows((data ?? []) as T[]);
        setLoading(false);
      }
    }
    load();

    const channel = supabase
      .channel(`live:${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [table, orderBy, ascending, limit]);

  return (
    <div className="border border-[var(--border)] bg-[var(--panel)] p-4 rounded">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        {title}
        <span className="text-xs text-[var(--muted)]">({rows.length})</span>
      </h2>
      {loading ? (
        <p className="text-xs text-[var(--muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">{empty ?? 'No rows yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                {columns.map((c) => (
                  <th key={String(c.key)} className="py-2 pr-3">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={(row.id as string | number | undefined) ?? i} className="border-t border-[var(--border)]">
                  {columns.map((c) => (
                    <td key={String(c.key)} className={`py-2 pr-3 ${c.className ?? ''}`}>
                      {c.render ? c.render(row) : String(row[c.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
