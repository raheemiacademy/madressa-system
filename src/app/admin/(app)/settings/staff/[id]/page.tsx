import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { getStaff, RANKS, SUPPORT_LOCKED } from '@/server/staff';
import { isSupportStaff } from '@/server/support';
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
  if (await isSupportStaff(db, id)) return (
    <section className="ra-card" aria-labelledby="support-h"><div className="ra-card-h"><h2 id="support-h">{r.s.name}</h2></div>
      <p style={{ margin: 0 }}>{SUPPORT_LOCKED} Madressa uses it to sign in and fix problems when you ask for help. Everything it does is in your audit log under this name.</p></section>
  );
  return <StaffForm ranks={RANKS} fields={fields} answers={cf.values} staff={{ ...r.s, allowLogin: r.allowLogin ?? false, hasPassword: !!r.hasPassword }} />;
}
