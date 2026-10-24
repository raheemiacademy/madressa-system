import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { ActionButton } from '@/components/Form';
import { penceToInput } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { getEvent } from '@/server/learning/events';
import { yearAndClasses } from '../../students/year-classes';
import { deleteEventAction } from '../actions';
import { EventEditor } from '../EventEditor';

export const metadata = { title: 'Event' };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('edit');
  const raw = (await params).id;
  const id = raw === 'new' ? null : Number(raw);
  const e = id ? await getEvent(db, id) : null;
  if (id && !e) notFound();
  const { options } = await yearAndClasses();
  const ev = e?.event;
  const d = ev?.durationMinutes ?? 0;
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{ev ? ev.name : 'Add event or trip'}</h1><p>{ev ? `${e!.optIns.length === 1 ? '1 opt-in' : `${e!.optIns.length} opt-ins`}` : 'Parents opt in from the parent portal; you can also record opt-ins here'}</p></div>
        {ev && <div className="ra-toolbar"><Link className="ra-btn primary" href={`/admin/events/${ev.id}/opt-ins`}>Opt-ins</Link>
          {adminCan(admin.staff, 'delete') && <ActionButton action={deleteEventAction.bind(null, ev.id)} label="Delete" danger confirm={`Delete “${ev.name}”? Invoices already raised are kept.`} />}</div>}</div>
      <EventEditor id={ev?.id ?? null} classes={options} locked={!!e?.optIns.length}
        v={{ name: ev?.name ?? '', date: ev?.date ?? '', time: ev?.time?.slice(0, 5) ?? '', days: Math.floor(d / 1440), hours: Math.floor((d % 1440) / 60), minutes: d % 60,
          optInDeadline: ev?.optInDeadline ?? '', paymentDeadline: ev?.paymentDeadline ?? '', description: ev?.description ?? '', terms: ev?.terms ?? '', classIds: (ev?.classIds ?? []).map(String),
          autoInvoice: ev?.autoInvoice ?? true, active: ev?.active ?? true, consents: (e?.consents ?? []).map((c) => ({ text: c.text, required: c.required })),
          prices: (e?.prices ?? []).map((p) => ({ description: p.description, price: penceToInput(p.pricePence), required: p.required })),
          slots: (e?.slots ?? []).map((s) => ({ date: s.date, from: s.fromTime.slice(0, 5), to: s.toTime.slice(0, 5) })) }} />
    </div>
  );
}
