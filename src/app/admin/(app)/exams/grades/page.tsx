import Link from 'next/link';
import { db } from '@/db';
import { Check, TextArea, TextField } from '@/components/Fields';
import { ActionButton, Form } from '@/components/Form';
import { requireAdmin } from '@/server/next/actor';
import { adminCan } from '@/server/permissions';
import { listGradeSystems } from '@/server/learning/exams';
import { loadStandardAction, saveGradesAction } from '../actions';
import { LEARNING_TOOLS } from '../tools';

export const metadata = { title: 'Grades' };

/** §15 Grades: grading systems as rows of "at least this % → grade". */
export default async function Grades() {
  const admin = await requireAdmin();
  const systems = await listGradeSystems(db);
  const canEdit = adminCan(admin.staff, 'edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Grades</h1><p>A grade is given when a student’s percentage is at least the number shown</p></div>
        <div className="ra-toolbar">{canEdit && !systems.some((s) => s.name === 'Standard') && <ActionButton action={loadStandardAction} label="Load standard grades" />}</div></div>
      <div className="ra-more"><span className="ra-more-l">More</span>{LEARNING_TOOLS.filter(([h]) => h !== '/admin/exams/grades').map(([h, l]) => <Link key={h} className="ra-btn" href={h}>{l}</Link>)}</div>
      {systems.length === 0 ? <p className="ra-empty">No grading systems yet. Load the standard grades or add your own.</p> : systems.map((s) => (
        <Form key={s.id} action={saveGradesAction.bind(null, s.id)} submit="Save grades">
          <div className="ra-card-h"><div><h2>{s.name}{s.isDefault ? ' (default)' : ''}</h2><div className="ra-note">{s.bands.map((b) => `${b.grade} ≥ ${b.minPct}%`).join(' · ')}</div></div></div>
          <div className="ra-fields"><TextField name="name" id={`gn-${s.id}`} label="Name" defaultValue={s.name} /></div>
          <TextArea name="bands" id={`gb-${s.id}`} label="Grades, one per line: percentage then grade" rows={7} defaultValue={s.bands.map((b) => `${b.minPct} ${b.grade}`).join('\n')} spellCheck={false} />
          <Check name="isDefault" label="Default for exams without their own" defaultChecked={s.isDefault} />
        </Form>
      ))}
      {canEdit && (
        <Form action={saveGradesAction.bind(null, null)} submit="Add grading system" resetOnSuccess>
          <div className="ra-card-h"><div><h2>New grading system</h2></div></div>
          <div className="ra-fields"><TextField name="name" label="Name" /></div>
          <TextArea name="bands" label="Grades, one per line: percentage then grade" rows={7} defaultValue={'90 A*\n80 A\n70 B\n60 C\n50 D\n0 U'} spellCheck={false} />
          <Check name="isDefault" label="Default for exams without their own" />
        </Form>
      )}
    </div>
  );
}
