import type { Metadata } from 'next';
import { LoginForm } from '@/app/_auth/LoginForm';
import { db } from '@/db';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Parent portal' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, profile] = await Promise.all([searchParams, getProfile(db)]);
  return <LoginForm portal="parent" title="Parent portal" school={profile?.name ?? 'School'} next={next} />;
}
