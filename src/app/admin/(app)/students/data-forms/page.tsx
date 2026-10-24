import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { classAssignment, contact, student, studentContact } from '@/db/schema';
import { PrintButton } from '@/components/PrintButton';
import { formatCalendarDate } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { getProfile } from '@/server/profile';
import { yearAndClasses } from '../year-classes';

export const metadata = { title: 'Data update forms' };

/** Printable data-check sheets, one page per student, for parents to correct and return. */
export default async function DataForms({ searchParams }: { searchParams: Promise<{ class?: string; message?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { options, classes } = await yearAndClasses();
  const classId = Number(sp.class) || null;
  const message = (sp.message ?? 'Please check these details, correct anything that has changed, and return this sheet to the school office.').slice(0, 1000);
  const [school, students] = await Promise.all([
    getProfile(db),
    classId ? db.select().from(classAssignment).innerJoin(student, eq(student.id, classAssignment.studentId))
      .where(and(eq(classAssignment.classId, classId), isNull(classAssignment.toDate))).orderBy(asc(student.surname), asc(student.firstName)) : Promise.resolve([])
  ]);
  const ids = students.map((r) => r.student.id);
  const links = ids.length ? await db.select().from(studentContact).innerJoin(contact, eq(contact.id, studentContact.contactId)).where(inArray(studentContact.studentId, ids)).orderBy(asc(studentContact.sortOrder)) : [];
  const className = classes.find((c) => c.c.id === classId)?.c.name;
  return (
    <div className="ra-page">
      <div className="ra-page-h no-print"><div><h1>Data update forms</h1><p>Printable sheets of each student’s details for parents to check.</p></div></div>
      <form className="ra-card ra-form no-print" action="/admin/students/data-forms">
        <div className="ra-fields">
          <div className="ra-field"><label htmlFor="df-class">Class</label><select className="ra-select" id="df-class" name="class" defaultValue={classId ?? ''}><option value="">Choose a class</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div className="ra-field full"><label htmlFor="df-msg">Message to parents</label><textarea className="ra-textarea" id="df-msg" name="message" defaultValue={message} maxLength={1000} /></div>
        </div>
        <div className="ra-toolbar"><button className="ra-btn">Show forms</button>{classId && <PrintButton label="Print or save as PDF" />}</div>
      </form>
      {classId && students.length === 0 && <p className="ra-empty">No current students in this class.</p>}
      {students.map(({ student: s }) => (
        <section key={s.id} className="ra-card ra-page-break" style={{ breakInside: 'avoid' }}>
          <div className="ra-card-h"><div><h2>{s.firstName} {s.surname}</h2><div className="ra-note">{school?.name} · {className} · Student #{s.id}</div></div></div>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message}</p>
          <dl className="ra-dl">
            <dt>Date of birth</dt><dd>{s.dob ? formatCalendarDate(s.dob) : '—'}</dd>
            <dt>Address</dt><dd>{[s.address, s.postcode].filter(Boolean).join('\n') || '—'}</dd>
            <dt>Telephone</dt><dd>{s.tel ?? '—'}</dd><dt>Mobile</dt><dd>{s.mobile ?? '—'}</dd>
            <dt>Medical notes</dt><dd>{s.hasMedical ? 'On file. Tell us if anything has changed.' : 'None recorded'}</dd>
          </dl>
          <h3 style={{ margin: '8px 0 0', fontSize: 14 }}>Contacts</h3>
          <table className="ra-table"><thead><tr><th>Name</th><th>Relation</th><th>Mobile</th><th>Email</th></tr></thead>
            <tbody>{links.filter((l) => l.student_contact.studentId === s.id).map((l) => (
              <tr key={l.contact.id}><td className="wrap">{l.contact.name}</td><td>{l.student_contact.relation ?? l.student_contact.type}</td><td>{l.contact.mobile ?? ''}</td><td className="wrap">{l.contact.email ?? ''}</td></tr>
            ))}</tbody></table>
          <p className="ra-note">Corrections:</p><div style={{ minHeight: 80, border: '1px dashed var(--color-border-line)', borderRadius: 8 }} />
        </section>
      ))}
      <p className="ra-note no-print"><Link href="/admin/students">Back to students</Link></p>
    </div>
  );
}
