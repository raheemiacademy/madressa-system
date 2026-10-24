import { requireAdmin } from '@/server/next/actor';
import { studentFormData } from '../form-data';
import { StudentForm } from '../StudentForm';

export const metadata = { title: 'Add student' };

export default async function NewStudent() {
  await requireAdmin('edit');
  const d = await studentFormData();
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Add student</h1><p>New students start on the waiting list unless you give them a class and status.</p></div></div>
      <StudentForm {...d} contacts={[]} s={{ firstName: '', surname: '', dob: '', gender: 'Unspecified', email: '', hasLogin: false, tel: '', mobile: '', mobile2: '', address: '', postcode: '', status: 'Waiting List', startDate: '', leftDate: '', classId: 'none', medicalNotes: '', notes: '', photo: null }} />
    </div>
  );
}
