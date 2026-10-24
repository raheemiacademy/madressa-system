import type { Metadata } from 'next';
import Link from 'next/link';
import { SetPasswordForm } from '@/app/_auth/PasswordForms';
import { db } from '@/db';
import { linkIsValid } from '@/server/password-links';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Teacher portal: choose your password', referrer: 'no-referrer' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const school = (await getProfile(db))?.name ?? 'School';
  if (!(await linkIsValid(db, 'teacher', token))) return (
    <main className="ra-auth"><div className="ra-auth-card"><div><div className="ra-muted" style={{ fontSize: 13 }}>{school}</div><h1>Link expired</h1></div>
      <p className="ra-note" style={{ margin: 0 }}>This link has expired or has already been used.</p><Link className="ra-btn primary" href="/teacher/set-password">Email me a new link</Link></div></main>
  );
  return <SetPasswordForm portal="teacher" school={school} token={token} />;
}
