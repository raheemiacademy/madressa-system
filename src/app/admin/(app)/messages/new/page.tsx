import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { adminStaff, contact, teacher } from '@/db/schema';
import { Checks, SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { yearAndClasses } from '../../students/year-classes';
import { composeAction } from '../actions';
import { ContactPicker } from '../ContactPicker';

export const metadata = { title: 'Compose message' };

export default async function Compose({ searchParams }: { searchParams: Promise<{ contact?: string; teacher?: string }> }) {
  const admin = await requireAdmin('edit');
  const sp = await searchParams;
  const [{ options }, teachers, staff, ranks, pre] = await Promise.all([
    yearAndClasses(),
    db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name)),
    db.select({ id: adminStaff.id, name: adminStaff.name }).from(adminStaff).where(and(isNull(adminStaff.deletedAt), ne(adminStaff.id, admin.staff.id))).orderBy(asc(adminStaff.name)),
    db.selectDistinct({ rank: adminStaff.rank }).from(adminStaff).where(and(isNull(adminStaff.deletedAt), sql`${adminStaff.rank} is not null`)),
    Number(sp.contact) ? db.select({ id: contact.id, name: contact.name, email: contact.email }).from(contact).where(eq(contact.id, Number(sp.contact))) : Promise.resolve([])
  ]);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Compose</h1><p>Each recipient gets their own conversation, so families never see each other’s messages.</p></div></div>
      <Form action={composeAction} submit="Send" encType="multipart/form-data">
        <ContactPicker initial={pre} />
        <Checks name="classIds" legend="Or a class (its students’ primary contacts)" options={options} />
        <Checks name="teacherIds" legend="Teachers" options={teachers.map((t) => ({ value: String(t.id), label: t.name }))} checked={sp.teacher ? [sp.teacher] : []} />
        <Checks name="staffIds" legend="Admin staff" options={staff.map((s) => ({ value: String(s.id), label: s.name }))} />
        <div className="ra-fields">
          <SelectField name="faoRank" label="Replies are for the attention of" options={[{ value: '', label: 'All admins' }, ...ranks.map((r) => ({ value: r.rank!, label: r.rank! }))]} />
          <TextField name="subject" label="Subject" full autoComplete="off" />
          <TextArea name="body" label="Message" rows={8} />
          <div className="ra-field"><label htmlFor="c-att">Attachment</label><input className="ra-input" id="c-att" name="attachment" type="file" style={{ paddingTop: 8 }} /></div>
        </div>
        <button className="ra-btn" name="lock" value="1">Send &amp; lock</button>
      </Form>
    </div>
  );
}
