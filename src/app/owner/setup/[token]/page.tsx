import { db } from '@/db';
import { ownerSetupView } from '@/server/owner/auth';
import { Brand } from '../../_ui/parts';
import { SetupForm } from './SetupForm';

// The token is in the address, so it's never sent on to another site.
export const metadata = { title: 'Set up', referrer: 'no-referrer' as const };

export default async function OwnerSetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await ownerSetupView(db, token);
  if (view) return <SetupForm token={token} email={view.email} keyText={view.key} url={view.url} />;
  return (
    <main className="signin">
      <div className="signin-card">
        <Brand />
        <h1>This link has expired</h1>
        <p className="note">Setup links work once, for 24 hours. For a new one, run <code>./madrasah owner &lt;your email&gt;</code> on the server.</p>
      </div>
    </main>
  );
}
