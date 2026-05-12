'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createSupabaseBrowserClient().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
      className="text-xs text-[var(--muted)] hover:text-white"
    >
      Sign out
    </button>
  );
}
