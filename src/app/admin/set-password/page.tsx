import type { Metadata } from 'next';
import { LoginForm } from '@/app/_auth/LoginForm';
import { db } from '@/db';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin: forgotten your password' };

export default async function Page() {
  // The sign-in card, opened on its "email me a link" side.
  return <LoginForm portal="admin" title="Admin sign in" school={(await getProfile(db))?.name ?? 'School'} />;
}
