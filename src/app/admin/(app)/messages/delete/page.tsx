import { asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { adminStaff, contact, teacher } from '@/db/schema';
import { SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { deleteRangeAction } from '../actions';

export const metadata = { title: 'Delete messages' };

export default async function DeleteMessages() {
  await requireAdmin('delete');
  const [teachers, contacts, staff] = await Promise.all([
    db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name)),
    db.select({ id: contact.id, name: contact.name }).from(contact).orderBy(asc(contact.name)).limit(3000),
    db.select({ id: adminStaff.id, name: adminStaff.name }).from(adminStaff).where(isNull(adminStaff.deletedAt)).orderBy(asc(adminStaff.name))
  ]);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Delete messages</h1><p>Deletes messages sent by, or in conversations with, one person between two dates. This can’t be undone.</p></div></div>
      <Form action={deleteRangeAction} submit="Delete messages">
        <div className="ra-fields">
          <TextField name="from" label="From" type="date" />
          <TextField name="to" label="To" type="date" />
          <SelectField name="person" label="Sender or recipient" full options={[{ value: '', label: 'Choose a person' },
            ...teachers.map((t) => ({ value: `teacher:${t.id}`, label: `Teacher: ${t.name}` })), ...contacts.map((c) => ({ value: `contact:${c.id}`, label: `Contact: ${c.name}` })), ...staff.map((s) => ({ value: `admin:${s.id}`, label: `Admin: ${s.name}` }))]} />
        </div>
      </Form>
    </div>
  );
}
