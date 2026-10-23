import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { getStaff, RANKS } from '@/server/staff';
import { StaffForm } from '../StaffForm';

export const metadata = { title: 'Admin staff' };

export default async function StaffEdit({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('super');
  const raw = (await params).id;
  if (raw === 'new') return <StaffForm ranks={RANKS} />;
  const id = Number(raw);
  const r = Number.isInteger(id) ? await getStaff(db, id) : null;
  if (!r) notFound();
  return <StaffForm ranks={RANKS} staff={{ ...r.s, allowLogin: r.allowLogin ?? false, hasPassword: !!r.hasPassword }} />;
}
