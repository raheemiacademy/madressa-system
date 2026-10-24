import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ChangePasswordForm } from '@/app/_auth/PasswordForms';
import { db } from '@/db';
import { sessionFor } from '@/server/next/actor';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Parent portal: choose your own password' };

export default async function Page() {
  if (!(await sessionFor('parent'))) redirect('/parent/login');
  return <ChangePasswordForm portal="parent" school={(await getProfile(db))?.name ?? 'School'} />;
}
