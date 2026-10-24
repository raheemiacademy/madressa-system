import { requireAdmin } from '@/server/next/actor';
import { TeacherFormPage } from '../form-pages';

export const metadata = { title: 'Add teacher' };

export default async function NewTeacher() {
  await requireAdmin('edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Add teacher</h1><p>Give them an email and password to use the teacher portal.</p></div></div>
      <TeacherFormPage t={{ name: '', dob: '', gender: 'Unspecified', email: '', tel: '', mobile: '', status: 'Employed', startDate: '', leftDate: '', address: '', postcode: '', niNumber: '', dbsNumber: '', dbsIssuedOn: '', dbsExpiresOn: '', medical: '', bankName: '', bankAccount: '', bankSortCode: '', hasLogin: false, hasKioskPin: false, photo: null, emergency: [] }} />
    </div>
  );
}
