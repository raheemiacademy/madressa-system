import { db } from '@/db';
import { GENDERS, STUDENT_STATUSES } from '@/db/schema';
import { requireAdmin } from '@/server/next/actor';
import { listApplicationGroups } from '@/server/people/extras';
import { yearAndClasses } from '../year-classes';

export const metadata = { title: 'Download students' };

export default async function Download() {
  await requireAdmin();
  const [{ options }, groups] = await Promise.all([yearAndClasses(), listApplicationGroups(db)]);
  const sel = (name: string, label: string, opts: { value: string; label: string }[]) => (
    <div className="ra-field"><label htmlFor={`d-${name}`}>{label}</label><select className="ra-select" id={`d-${name}`} name={name}>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
  );
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Download students</h1><p>A CSV of students with the columns and filters you choose. Opens in Excel.</p></div></div>
      <form className="ra-card ra-form" action="/admin/students/download/export">
        <div className="ra-fields">
          {sel('status', 'Status', [{ value: '', label: 'Any status' }, ...STUDENT_STATUSES.map((s) => ({ value: s, label: s }))])}
          {sel('class', 'Class', [{ value: '', label: 'Any class' }, ...options])}
          {sel('gender', 'Gender', [{ value: '', label: 'Any' }, ...GENDERS.map((g) => ({ value: g, label: g }))])}
          {sel('group', 'Application group', [{ value: '', label: 'Any' }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))])}
          {sel('order', 'Order by', [{ value: 'surname', label: 'Surname' }, { value: 'name', label: 'First name' }, { value: 'age', label: 'Age' }, { value: 'class', label: 'Class' }, { value: 'start', label: 'Start date' }])}
        </div>
        <fieldset className="ra-fieldset"><legend>Extra columns</legend>
          <div className="ra-checks">
            {[['contacts', 'Contacts'], ['primaryOnly', 'Primary contact only'], ['teacher', 'Main teacher'], ['address', 'Address'], ['medical', 'Medical notes'], ['medicalOnly', 'Only students with medical notes']].map(([v, l]) => (
              <label key={v} className="ra-check"><input type="checkbox" name={v} value="1" /><span>{l}</span></label>
            ))}
          </div>
        </fieldset>
        <div className="ra-toolbar"><button className="ra-btn primary">Download CSV</button></div>
      </form>
    </div>
  );
}
