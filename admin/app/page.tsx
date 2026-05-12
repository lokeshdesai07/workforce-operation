import { requireAdmin } from '@/lib/auth';
import { CreateWorkerForm } from '@/components/CreateWorkerForm';
import { CreateInspectionForm } from '@/components/CreateInspectionForm';
import { SignOutButton } from '@/components/SignOutButton';
import { LiveInspections } from '@/components/LiveInspections';
import { LiveWorkers } from '@/components/LiveWorkers';
import { LiveConflicts } from '@/components/LiveConflicts';
import { LiveIdempotency } from '@/components/LiveIdempotency';

export default async function HomePage() {
  const user = await requireAdmin();

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Workforce Ops — Admin</h1>
          <p className="text-xs text-[var(--muted)]">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CreateWorkerForm />
        <CreateInspectionForm />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveWorkers />
        <LiveInspections />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveConflicts />
        <LiveIdempotency />
      </section>
    </main>
  );
}
