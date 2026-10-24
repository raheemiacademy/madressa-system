import type { Metadata } from 'next';
import { RequestLinkForm } from '@/app/_auth/PasswordForms';
import { db } from '@/db';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Teacher portal: set your password' };

export default async function Page() {
  return <RequestLinkForm portal="teacher" school={(await getProfile(db))?.name ?? 'School'} />;
}
