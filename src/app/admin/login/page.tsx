import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/app/_auth/LoginForm';
import { db } from '@/db';
import { needsFirstAdmin } from '@/server/onboarding';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin sign in' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // A brand-new installation has no one to sign in yet: set it up first.
  if (await needsFirstAdmin(db)) redirect('/admin/setup');
  const [{ next }, profile] = await Promise.all([searchParams, getProfile(db)]);
  return <LoginForm portal="admin" title="Admin sign in" school={profile?.name ?? 'School'} next={next} />;
}
