import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { adminStaff, INCIDENT_SEVERITIES, incident, teacher } from '@/db/schema';
import { ActionButton } from '@/components/Form';
import { toUkLocal } from '@/lib/dates';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { classStudentsOn } from '@/server/attendance/registers';
import { listIncidentTemplates } from '@/server/learning/incidents';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../../students/year-classes';
import { deleteIncidentAction } from '../actions';
import { IncidentForm } from '../IncidentForm';
import { WhatsAppList } from '@/components/WhatsAppList';
import { incidentWhatsapp } from '@/server/comm/whatsapp';

export const metadata = { title: 'Incident' };

export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ student?: string; class?: string }> }) {
  const admin = await requireAdmin('edit');
  const raw = (await params).id;
  const sp = await searchParams;
  const id = raw === 'new' ? null : Number(raw);
  const [i] = id ? await db.select().from(incident).where(eq(incident.id, id)) : [];
  if (id && !i) notFound();
  const [{ options }, teachers, staff, templates] = await Promise.all([yearAndClasses(), db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name)),
    db.select({ id: adminStaff.id, name: adminStaff.name }).from(adminStaff).where(isNull(adminStaff.deletedAt)).orderBy(asc(adminStaff.name)), listIncidentTemplates(db)]);
  const wa = i?.studentId ? await incidentWhatsapp(db, i.id) : null;
  const today = todayIso();
  const rosters = Object.fromEntries(await Promise.all(options.map(async (o) => [o.value, (await classStudentsOn(db, Number(o.value), today)).map((s) => ({ value: String(s.id), label: `${s.firstName} ${s.surname}` }))])));
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>{i ? i.title : 'Record an incident'}</h1><p>For a student, a teacher or a member of staff</p></div>
        <div className="ra-toolbar">{i && adminCan(admin.staff, 'delete') && <ActionButton action={deleteIncidentAction.bind(null, i.id)} label="Delete" danger confirm="Delete this incident?" />}<Link className="ra-btn" href="/admin/incidents">Incidents</Link></div></div>
      <IncidentForm id={i?.id ?? null} classes={options} rosters={rosters} teachers={teachers.map((t) => ({ value: String(t.id), label: t.name }))} staff={staff.map((s) => ({ value: String(s.id), label: s.name }))}
        severities={INCIDENT_SEVERITIES} templates={templates}
        v={{ kind: i?.kind ?? 'student', classId: String(i?.classId ?? sp.class ?? ''), studentId: String(i?.studentId ?? sp.student ?? ''), teacherId: String(i?.teacherId ?? ''), staffId: String(i?.staffId ?? ''),
          severity: i?.severity ?? 'Low', occurredAt: i ? toUkLocal(i.occurredAt) : toUkLocal(new Date()), title: i?.title ?? '', report: i?.report ?? '', action: i?.action ?? '', inEoty: i?.inEoty ?? false, onPortal: i?.onPortal ?? false }} />
      {wa && (
        <section className="ra-card" aria-labelledby="wa-inc-h">
          <div className="ra-card-h"><div><h2 id="wa-inc-h">Tell the parents on WhatsApp</h2><div className="ra-note">The student’s main contacts, with the incident message ready. Change the wording in WhatsApp before you send if you need to.</div></div></div>
          <WhatsAppList people={wa} label="Main contacts" />
        </section>
      )}
    </div>
  );
}
