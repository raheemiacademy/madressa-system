import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { loginFor } from '@/server/people/logins';
import { getStudent } from '@/server/people/students';
import { studentFormData } from '../../form-data';
import { StudentForm } from '../../StudentForm';

export const metadata = { title: 'Edit student' };

export default async function EditStudent({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('edit');
  const id = Number((await params).id);
  const s = Number.isInteger(id) ? await getStudent(db, id) : null;
  if (!s) notFound();
  const [d, login] = await Promise.all([studentFormData(id), loginFor(db, 'student', id)]);
  const current = s.currentClasses[0]?.c.id;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Edit {s.firstName} {s.surname}</h1><p>Student #{s.id}</p></div></div>
      <StudentForm {...d}
        s={{ id, firstName: s.firstName, surname: s.surname, dob: s.dob ?? '', gender: s.gender, email: s.email ?? '', hasLogin: !!login?.passwordHash, tel: s.tel ?? '', mobile: s.mobile ?? '', mobile2: s.mobile2 ?? '', address: s.address ?? '', postcode: s.postcode ?? '', status: s.status, startDate: s.startDate ?? '', leftDate: s.leftDate ?? '', classId: current ? String(current) : 'none', medicalNotes: s.medicalNotes ?? '', notes: s.notes ?? '', photo: s.photoFileId }}
        classes={current && !d.classes.some((c) => c.value === String(current)) ? [...d.classes, { value: String(current), label: s.currentClasses[0]!.c.name }] : d.classes}
        contacts={s.contacts.map((c, i) => ({ key: i, contactId: c.c.id, display: [c.c.name, c.c.email ?? c.c.mobile].filter(Boolean).join(' · '), name: '', email: '', tel: '', mobile: '', altMobile: '', type: c.link.type, relation: c.link.relation ?? '', isPrimary: c.link.isPrimary, portalAccess: c.link.portalAccess }))} />
    </div>
  );
}
