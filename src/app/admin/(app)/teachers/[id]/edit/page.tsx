import { notFound } from 'next/navigation';
import { db } from '@/db';
import { requireAdmin } from '@/server/next/actor';
import { getTeacher } from '@/server/people/teachers';
import { TeacherFormPage } from '../../form-pages';

export const metadata = { title: 'Edit teacher' };

export default async function EditTeacher({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('edit');
  const id = Number((await params).id);
  const t = Number.isInteger(id) ? await getTeacher(db, id) : null;
  if (!t) notFound();
  const s = (v: string | null) => v ?? '';
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Edit {t.name}</h1><p>Teacher #{t.id}</p></div></div>
      <TeacherFormPage t={{ id, name: t.name, dob: s(t.dob), gender: t.gender, email: s(t.email), tel: s(t.tel), mobile: s(t.mobile), status: t.status, startDate: s(t.startDate), leftDate: s(t.leftDate),
        address: s(t.address), postcode: s(t.postcode), niNumber: t.niNumber, dbsNumber: s(t.dbsNumber), dbsIssuedOn: s(t.dbsIssuedOn), dbsExpiresOn: s(t.dbsExpiresOn), medical: t.medical,
        bankName: t.bankName, bankAccount: t.bankAccount, bankSortCode: t.bankSortCode, hasLogin: !!t.login?.passwordHash, hasKioskPin: t.hasKioskPin, photo: t.photoFileId, emergency: t.emergency }} />
    </div>
  );
}
