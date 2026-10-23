import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { getStaff, RANKS } from '@/server/staff';
import { answersFor } from '@/server/people/custom-fields';
import { StaffForm } from '../StaffForm';

export const metadata = { title: 'Admin staff' };

export default async function StaffEdit({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('super');
  const raw = (await params).id;
  const id = raw === 'new' || !/^\d{1,9}$/.test(raw) ? 0 : Number(raw);
  const cf = await answersFor(db, 'staff', id);
  const fields = cf.fields.map((f) => ({ id: f.id, label: f.label, question: f.question, type: f.type, options: f.options, maxLength: f.maxLength }));
  if (raw === 'new') return <StaffForm ranks={RANKS} fields={fields} />;
  const r = Number.isInteger(id) ? await getStaff(db, id) : null;
  if (!r) notFound();
  return <StaffForm ranks={RANKS} fields={fields} answers={cf.values} staff={{ ...r.s, allowLogin: r.allowLogin ?? false, hasPassword: !!r.hasPassword }} />;
}
