import { notFound } from 'next/navigation';
import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { ActionButton, Form } from '@/components/Form';
import { formatInstant } from '@/lib/dates';
import { requireTeacher } from '@/server/next/portal';
import { classOf, PortalDenied } from '@/server/portal/access';
import { homeworkRoster, homeworkRow } from '@/server/portal/teacher';
import { completeAction, remindAction } from '../../actions';

export const metadata = { title: 'Homework' };

/** One piece of homework: tick who has done it, open hand-ins from the parent portal, and remind the rest. */
export default async function HomeworkRoster({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher('Homework');
  const id = Number((await params).id);
  const h = Number.isInteger(id) ? await homeworkRow(db, id) : null;
  const cls = h && (() => { try { return classOf(t.ctx, h.classId, 'canHomework'); } catch (e) { if (e instanceof PortalDenied) return null; throw e; } })();
  if (!h || !cls) notFound();
  const roster = await homeworkRoster(db, id);
  const done = roster.filter((s) => s.completedAt || s.uploadedAt).length;
  return (
    <>
      <PortalHead title={h.title} kicker={`${cls.name} · due ${formatInstant(h.deadlineAt, 'EEE d MMM, HH:mm')}`} back="/teacher/homework" />
      <main className="rp-main">
        <div className="rp-row"><span><b>{done} of {roster.length} handed in</b><small>Ticked here, or uploaded by a parent</small></span>
          {done < roster.length && <ActionButton action={remindAction.bind(null, id)} label={`Remind ${roster.length - done === 1 ? '1 parent' : `${roster.length - done} parents`}`} className="ra-btn tap" />}</div>
        <Form action={completeAction.bind(null, id)} submit="Save" savebar={false}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {roster.map((s) => (
              <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--ra-hairline)' }}>
                <label className="ra-check" style={{ flex: 1, minHeight: 44, alignItems: 'center' }}><input type="checkbox" name="done" value={s.id} defaultChecked={!!s.completedAt} /> {s.firstName} {s.surname}</label>
                {s.uploadFileId && <a href={`/teacher/file/${s.uploadFileId}`}>Handed in {s.uploadedAt ? formatInstant(s.uploadedAt, 'd MMM') : ''}</a>}
              </li>
            ))}
          </ul>
        </Form>
      </main>
    </>
  );
}
