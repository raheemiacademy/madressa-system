import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { getProfile } from '@/server/profile';
import { ProfileForm } from './ProfileForm';

export const metadata = { title: 'School profile' };

export default async function ProfilePage() {
  await requireAdmin('super');
  const p = await getProfile(db);
  return <ProfileForm profile={p} />;
}
