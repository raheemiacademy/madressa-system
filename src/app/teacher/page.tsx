import { redirect } from 'next/navigation';
import { logoutAction } from '@/app/_auth/actions';
import { sessionFor } from '@/server/next/actor';

export const dynamic = 'force-dynamic';

// shortcut: placeholder home; the real Teacher portal screens are built in Phase 8.
export default async function Page() {
  const s = await sessionFor('teacher');
  if (!s) redirect('/teacher/login');
  return (
    <main className="ra-page">
      <div className="ra-page-h"><div><h1>Teacher portal</h1><p>Signed in as {s.identity.email}</p></div></div>
      <form action={logoutAction.bind(null, 'teacher')}><button className="ra-btn" type="submit">Sign out</button></form>
    </main>
  );
}
