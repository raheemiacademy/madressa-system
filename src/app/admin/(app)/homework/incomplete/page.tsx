import Link from 'next/link';
import { WhatsAppReminders } from '@/components/WhatsAppReminders';
import { remindFamilies } from '@/server/comm/whatsapp';
import { db } from '@/db';
import { Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { incomplete } from '@/server/learning/homework';
import { yearAndClasses } from '../../students/year-classes';
import { remindersAction } from '../actions';

export const metadata = { title: 'Incomplete homework' };
const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);

export default async function Incomplete({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { options } = await yearAndClasses();
  const rows = await incomplete(db, { classId: Number(sp.class) || undefined, from: date(sp.from), to: date(sp.to) });
  const wa = await remindFamilies(db, rows, (first, mine) =>
    `Salaam ${first}, a reminder that ${mine.map((r) => `${r.firstName} hasn’t handed in “${r.title}” yet (it was due ${formatInstant(r.deadlineAt, 'dd/MM')})`).join(', and ')}. Please help them finish it. JazakAllahu khairan.`);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Incomplete homework</h1><p>Students who haven’t finished active homework that’s past its deadline</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href="/admin/settings/templates/homework.reminder">Edit email</Link><Link className="ra-btn" href="/admin/homework">Homework</Link></div></div>
      <form className="ra-card ra-toolbar" role="search">
        <div className="ra-field"><label htmlFor="in-class">Class</label><select className="ra-select" id="in-class" name="class" defaultValue={sp.class ?? ''}><option value="">All classes</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="ra-field"><label htmlFor="in-from">Due from</label><input className="ra-input" id="in-from" type="date" name="from" defaultValue={date(sp.from) ?? ''} /></div>
        <div className="ra-field"><label htmlFor="in-to">Due to</label><input className="ra-input" id="in-to" type="date" name="to" defaultValue={date(sp.to) ?? ''} /></div>
        <button className="ra-btn">Filter</button>
      </form>
      <WhatsAppReminders title="Remind families on WhatsApp" list={wa} />
      <section className="ra-card" aria-label="Incomplete homework">
        {rows.length === 0 ? <p className="ra-empty">Everyone is up to date.</p> : (
          <Form action={remindersAction} card={false} savebar={false} submit="Send reminders">
            <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 600 }}><table className="ra-table">
              <thead><tr><th><span className="sr-only">Select</span></th><th>Student</th><th>Homework</th><th>Class</th><th>Was due</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={`${r.homeworkId}:${r.studentId}`}><td><input type="checkbox" name="pairs" value={`${r.homeworkId}:${r.studentId}`} defaultChecked aria-label={`Include ${r.firstName} ${r.surname}, ${r.title}`} /></td>
                  <td className="wrap">{r.firstName} {r.surname}</td><td className="wrap"><Link href={`/admin/homework/${r.homeworkId}`}>{r.title}</Link></td><td>{r.className}</td><td>{formatInstant(r.deadlineAt, 'dd/MM/yyyy HH:mm')}</td></tr>
              ))}</tbody>
            </table></div>
            <button className="ra-btn" name="test" value="1">Send a test to me</button>
          </Form>
        )}
      </section>
    </div>
  );
}
