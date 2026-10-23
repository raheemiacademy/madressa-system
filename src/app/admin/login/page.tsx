import type { Metadata } from 'next';
import { LoginForm } from '@/app/_auth/LoginForm';
import { db } from '@/db';
import { getProfile } from '@/server/profile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin sign in' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, profile] = await Promise.all([searchParams, getProfile(db)]);
  return <LoginForm portal="admin" title="Admin sign in" school={profile?.name ?? 'School'} next={next} />;
}
