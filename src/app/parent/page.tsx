import { redirect } from 'next/navigation';
import { logoutAction } from '@/app/_auth/actions';
import { sessionFor } from '@/server/next/actor';

export const dynamic = 'force-dynamic';

// shortcut: placeholder home; the real Parent portal screens are built in Phase 8.
export default async function Page() {
  const s = await sessionFor('parent');
  if (!s) redirect('/parent/login');
  return (
    <main className="ra-page">
      <div className="ra-page-h"><div><h1>Parent portal</h1><p>Signed in as {s.identity.email}</p></div></div>
      <form action={logoutAction.bind(null, 'parent')}><button className="ra-btn" type="submit">Sign out</button></form>
    </main>
  );
}
