import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { SelectField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { formatPence } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { classStudentsOn } from '@/server/attendance/registers';
import { getEvent } from '@/server/learning/events';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../../students/year-classes';
import { optInAction, withdrawAction } from '../../actions';

export const metadata = { title: 'Event opt-ins' };

export default async function OptIns({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('edit');
  const id = Number((await params).id);
  const e = Number.isInteger(id) ? await getEvent(db, id) : null;
  if (!e) notFound();
  const { options } = await yearAndClasses();
  const classes = e.event.classIds.length ? options.filter((o) => e.event.classIds.includes(Number(o.value))) : options;
  const today = todayIso();
  const kids = (await Promise.all(classes.map((c) => classStudentsOn(db, Number(c.value), today)))).flat();
  const taken = new Set(e.optIns.map((o) => o.o.studentId));
  const free = [...new Map(kids.filter((k) => !taken.has(k.id)).map((k) => [k.id, k])).values()];
  const total = e.optIns.reduce((s, o) => s + o.o.totalPence, 0);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{e.event.name}: opt-ins</h1><p>{formatCalendarDate(e.event.date)}{e.event.optInDeadline ? ` · opt in by ${formatCalendarDate(e.event.optInDeadline)}` : ''}</p></div>
        <div className="ra-toolbar"><Link className="ra-btn" href={`/admin/events/${id}`}>Event details</Link></div></div>
      <section className="ra-card" aria-labelledby="oi-h">
        <div className="ra-card-h"><div><h2 id="oi-h">{e.optIns.length === 1 ? '1 student opted in' : `${e.optIns.length} students opted in`}</h2><div className="ra-note">{formatPence(total)} in total</div></div></div>
        {e.optIns.length === 0 ? <p className="ra-empty">Nobody has opted in yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th>Student</th><th>Timeslot</th><th className="num">Total</th><th>Invoice</th><th>From</th><th><span className="sr-only">Withdraw</span></th></tr></thead>
            <tbody>{e.optIns.map((o) => {
              const slot = e.slots.find((s) => s.id === o.o.timeslotId);
              return (
                <tr key={o.o.studentId}><td className="wrap"><Link href={`/admin/fees/student/${o.o.studentId}`}>{o.firstName} {o.surname}</Link></td><td>{slot ? `${formatCalendarDate(slot.date)} ${slot.fromTime.slice(0, 5)}` : ''}</td>
                  <td className="num">{formatPence(o.o.totalPence)}</td><td>{o.o.invoiceId ? `#${o.o.invoiceId}` : ''}</td><td>{o.o.source === 'portal' ? 'Parent portal' : 'Office'} · {formatInstant(o.o.createdAt, 'dd/MM')}</td>
                  <td><ActionButton action={withdrawAction.bind(null, id, o.o.studentId)} label="Withdraw" confirm={`Withdraw ${o.firstName} ${o.surname}?`} /></td></tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
      {free.length > 0 && e.event.active && (
        <Form action={optInAction.bind(null, id)} submit="Opt in" resetOnSuccess>
          <div className="ra-card-h"><div><h2>Record an opt-in</h2><div className="ra-note">For a family who replied on paper or by phone</div></div></div>
          <div className="ra-fields">
            <SelectField name="studentId" label="Student" options={free.map((k) => ({ value: String(k.id), label: `${k.surname}, ${k.firstName}` }))} />
            {e.slots.length > 0 && <SelectField name="timeslotId" label="Timeslot" options={e.slots.map((s) => ({ value: String(s.id), label: `${formatCalendarDate(s.date)} ${s.fromTime.slice(0, 5)}–${s.toTime.slice(0, 5)}` }))} />}
          </div>
          {e.consents.length > 0 && <fieldset className="ra-fieldset"><legend>Consents given</legend><div className="ra-checks">{e.consents.map((c) => <label key={c.id} className="ra-check"><input type="checkbox" name="consentIds" value={c.id} /><span>{c.text}{c.required ? ' (required)' : ''}</span></label>)}</div></fieldset>}
          {e.prices.some((p) => !p.required) && <fieldset className="ra-fieldset"><legend>Optional extras</legend><div className="ra-checks">{e.prices.filter((p) => !p.required).map((p) => <label key={p.id} className="ra-check"><input type="checkbox" name="priceIds" value={p.id} /><span>{p.description} ({formatPence(p.pricePence)})</span></label>)}</div></fieldset>}
        </Form>
      )}
    </div>
  );
}
