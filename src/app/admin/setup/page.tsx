import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SetupForm } from '@/app/_auth/SetupForm';
import { db } from '@/db';
import { needsFirstAdmin } from '@/server/onboarding';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Set up your madrasah' };

/** Open only on a brand-new installation (no admin staff yet). After that it sends people to sign in. */
export default async function Setup() {
  if (!(await needsFirstAdmin(db))) redirect('/admin/login');
  return <SetupForm ready={(process.env.SETUP_CODE ?? '').length >= 8} />;
}
