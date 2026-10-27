import type { Metadata } from 'next';
import { SetPasswordForm } from '@/app/_auth/PasswordForms';
import { db } from '@/db';
import { linkIsValid } from '@/server/password-links';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Choose your password', referrer: 'no-referrer' };

/** A set-password link for an admin, made from the owner dashboard for someone who is locked out. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const school = (await getProfile(db))?.name ?? 'School';
  if (!(await linkIsValid(db, 'admin', token))) return (
    <main className="ra-auth"><div className="ra-auth-card"><div><div className="ra-muted" style={{ fontSize: 13 }}>{school}</div><h1>Link expired</h1></div>
      <p className="ra-note" style={{ margin: 0 }}>This link has expired or has already been used. Ask for a new one.</p></div></main>
  );
  return <SetPasswordForm portal="admin" school={school} token={token} />;
}
