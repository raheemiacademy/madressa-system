import { asc, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { teacher } from '@/db/schema';
import { Checks, SelectField, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listRooms, listSubjects, listTemplates, slotsFor } from '@/server/people/classes';
import { yearAndClasses } from '../../students/year-classes';
import { copyTimingsAction, deleteTemplateAction, saveTemplateAction } from '../actions';
import { SlotForm, SlotList, WEEKDAYS } from '../SlotParts';

export const metadata = { title: 'Timetable' };

export default async function Timetable({ searchParams }: { searchParams: Promise<{ class?: string; template?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const { classes, options } = await yearAndClasses();
  const [templates, rooms, subjects, teachers] = await Promise.all([listTemplates(db), listRooms(db), listSubjects(db), db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(isNull(teacher.deletedAt)).orderBy(asc(teacher.name))]);
  const classId = Number(sp.class) || Number(options[0]?.value) || null;
  const templateId = Number(sp.template) || null;
  const template = templates.find((t) => t.t.id === templateId);
  const [classSlots, templateSlots] = await Promise.all([classId ? slotsFor(db, { classId }) : [], template ? slotsFor(db, { templateId: template.t.id }) : []]);
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Timetable</h1><p>Weekly sessions for each class, and reusable templates.</p></div><div className="ra-toolbar"><Link className="ra-btn" href="/admin/classes">Classes</Link></div></div>
      <nav className="ra-filters" aria-label="Class">{options.map((o) => <Link key={o.value} className="ra-filter" href={`?class=${o.value}`} aria-current={String(classId) === o.value && !template ? 'page' : undefined}>{o.label}</Link>)}</nav>
      {classId && (
        <section className="ra-card" aria-labelledby="wk-h">
          <div className="ra-card-h"><div><h2 id="wk-h">{classes.find((c) => c.c.id === classId)?.c.name} week</h2></div><Link className="ra-link" href={`/admin/classes/${classId}`}>Edit sessions</Link></div>
          {classSlots.length === 0 ? <p className="ra-empty">No sessions yet.</p> : (
            <div className="ra-tt">
              {WEEKDAYS.slice(1).map((d, i) => (
                <div key={d}><h4>{d.slice(0, 3)}</h4>
                  {classSlots.filter((x) => x.s.weekday === i + 1).map((x) => (
                    <div key={x.s.id} className="ra-slot"><b>{x.s.startTime.slice(0, 5)}</b> · {Math.floor(x.s.durationMinutes / 60)}h{x.s.durationMinutes % 60 ? ` ${x.s.durationMinutes % 60}m` : ''}<br />{x.subject ?? 'Session'}{x.room ? ` · ${x.room}` : ''}<br /><span className="ra-muted">{x.teacher ?? ''}</span></div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="ra-card" aria-labelledby="tp-h">
        <div className="ra-card-h"><div><h2 id="tp-h">Timetable templates</h2><div className="ra-note">Build a week once, then apply it to several classes.</div></div></div>
        {templates.length === 0 ? <p className="ra-empty">No templates yet.</p> : (
          <nav className="ra-filters" aria-label="Templates">{templates.map(({ t, n }) => <Link key={t.id} className="ra-filter" href={`?template=${t.id}`} aria-current={templateId === t.id ? 'page' : undefined}>{t.name} <b>{n}</b></Link>)}</nav>
        )}
        {template && (
          <>
            <h3 style={{ margin: 0, fontSize: 15 }}>{template.t.name}</h3>
            <SlotList slots={templateSlots} canEdit={canEdit} />
            {canEdit && <SlotForm owner={{ templateId: template.t.id }} teachers={teachers} rooms={rooms} subjects={subjects} />}
            {canEdit && <ActionButton className="ra-link" action={deleteTemplateAction.bind(null, template.t.id)} label="Delete template" confirm={`Delete ${template.t.name}?`} danger />}
          </>
        )}
        {canEdit && <Form action={saveTemplateAction.bind(null, undefined)} card={false} savebar={false} submit="Add template"><TextField name="name" label="New template name" placeholder="e.g. Weekday evenings" /></Form>}
      </section>
      {canEdit && (
        <div id="copy">
          <Form action={copyTimingsAction} submit="Copy sessions">
            <div className="ra-card-h"><div><h2>Apply a template or duplicate class timings</h2><div className="ra-note">Replaces the chosen classes’ sessions with a copy.</div></div></div>
            <SelectField name="source" label="Copy from" options={[{ value: '', label: 'Choose' }, ...templates.map(({ t }) => ({ value: `template:${t.id}`, label: `Template: ${t.name}` })), ...options.map((o) => ({ value: `class:${o.value}`, label: `Class: ${o.label}` }))]} />
            <Checks name="targets" legend="To these classes" options={options} />
          </Form>
        </div>
      )}
    </div>
  );
}
