import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { academicYear, contact, INVOICE_TYPES, invoice, student, studentContact } from '@/db/schema';
import { SelectField, TextArea, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { penceToInput } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../students/year-classes';
import { saveInvoiceAction } from '../actions';

export const metadata = { title: 'Invoice' };

/** §2 add-invoice / modify invoice. */
export default async function InvoicePage({ searchParams }: { searchParams: Promise<{ student?: string; edit?: string }> }) {
  await requireAdmin('fees');
  const sp = await searchParams;
  const editId = Number(sp.edit) || null;
  const [cur] = editId ? await db.select().from(invoice).where(and(eq(invoice.id, editId), isNull(invoice.deletedAt))).limit(1) : [];
  if (editId && !cur) notFound();
  const studentId = cur?.studentId ?? (Number(sp.student) || null);
  const [s] = studentId ? await db.select().from(student).where(eq(student.id, studentId)).limit(1) : [];
  if (studentId && !s) notFound();
  const [{ year }, years, contacts, students] = await Promise.all([
    yearAndClasses(), db.select().from(academicYear).orderBy(asc(academicYear.startsOn)),
    s ? db.select({ id: contact.id, name: contact.name, relation: studentContact.relation, type: studentContact.type }).from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId)).where(eq(studentContact.studentId, s.id)).orderBy(asc(studentContact.sortOrder)) : Promise.resolve([]),
    s ? Promise.resolve([]) : db.select({ id: student.id, firstName: student.firstName, surname: student.surname, status: student.status }).from(student).orderBy(asc(student.surname), asc(student.firstName))
  ]);
  const today = todayIso();
  const v = cur ?? null;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{v ? `Modify invoice #${v.id}` : 'Create manual invoice'}</h1><p>{s ? `${s.firstName} ${s.surname} (#${s.id})` : 'Choose the student this invoice is for'}</p></div>
        <div className="ra-toolbar">{s && <Link className="ra-btn" href={`/admin/fees/student/${s.id}`}>Back to their fees</Link>}</div></div>
      <Form action={saveInvoiceAction.bind(null, v?.id ?? null)} submit={v ? 'Save invoice' : 'Create invoice'}>
        <div className="ra-fields">
          {s ? <input type="hidden" name="studentId" value={s.id} />
            : <SelectField name="studentId" label="Student" options={[{ value: '', label: 'Choose a student' }, ...students.map((x) => ({ value: String(x.id), label: `${x.surname}, ${x.firstName} (#${x.id}, ${x.status})` }))]} />}
          <SelectField name="type" label="Type" defaultValue={v?.type ?? 'Fees'} options={INVOICE_TYPES.map((t) => ({ value: t, label: t }))} />
          <SelectField name="academicYearId" label="Academic year" defaultValue={String(v?.academicYearId ?? year?.id ?? '')} options={years.map((y) => ({ value: String(y.id), label: y.title }))} />
          <TextField name="invoiceDate" label="Invoice date" type="date" defaultValue={v?.invoiceDate ?? today} />
          <TextField name="amount" label="Amount (£)" inputMode="decimal" defaultValue={v ? penceToInput(v.amountPence) : ''} autoComplete="off" />
          <TextField name="description" label="Description" defaultValue={v?.description ?? ''} full />
          <TextField name="periodFrom" label="Period from" type="date" defaultValue={v?.periodFrom ?? ''} />
          <TextField name="periodTo" label="Period to" type="date" defaultValue={v?.periodTo ?? ''} />
          <TextField name="dueDate" label="Due date" type="date" defaultValue={v?.dueDate ?? today} />
        </div>
        <fieldset className="ra-fieldset"><legend>Billing contact</legend>
          <div className="ra-fields">
            <SelectField name="billingContactId" label="Contact" defaultValue={String(v?.billingContactId ?? '')} help={s ? 'Choosing a contact doesn’t fill in the name and address below.' : 'Choose the student first to pick one of their contacts.'}
              options={[{ value: '', label: 'Primary contact' }, ...contacts.map((c) => ({ value: String(c.id), label: `${c.name} (${c.relation ?? c.type})` }))]} />
            <TextField name="billingName" label="Contact name" defaultValue={v?.billingName ?? ''} autoComplete="off" />
            <TextArea name="billingAddress" label="Address" rows={2} defaultValue={v?.billingAddress ?? ''} />
            <TextField name="billingPostcode" label="Postcode" defaultValue={v?.billingPostcode ?? ''} autoCapitalize="characters" />
            <TextArea name="billingNotes" label="Notes" rows={2} defaultValue={v?.billingNotes ?? ''} />
          </div>
        </fieldset>
      </Form>
    </div>
  );
}
