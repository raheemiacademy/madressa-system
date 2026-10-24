import { redirect } from 'next/navigation';
import { logoutAction } from '@/app/_auth/actions';
import { db } from '@/db';
import { readTab } from '@/server/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Portal closed' };

/** Shown while the school has turned the parent portal off (Settings → Parent portal → Disable). */
export default async function Closed() {
  const tab = await readTab(db, 'parentPortal');
  if (!tab.disabled) redirect('/parent');
  return (
    <main className="rp" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: '26rem', textAlign: 'center', display: 'grid', gap: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontWeight: 400, margin: 0 }}>The parent portal is closed</h1>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{String(tab.disabledMessage || 'Please check back later, or contact the school office.')}</p>
        <form action={logoutAction.bind(null, 'parent')}><button className="ra-btn" type="submit">Sign out</button></form>
      </div>
    </main>
  );
}
